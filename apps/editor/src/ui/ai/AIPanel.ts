/**
 * AIPanel — AI Design Assistant chat panel.
 *
 * Phase 9 — Task 9.2 / 9.3 / 9.4: Simplified to chat-only interface.
 * Validate/Reports/Actions have moved to ValidatePanel (left rail VALIDATE tab).
 *
 * Structure:
 *   .ai-chat-panel
 *     .ai-chat-header          — gradient header
 *     .ai-chat-transcript      — scrollable message + inline card area
 *     .ai-suggestions          — three-level suggestion pill area
 *     .ai-chat-input-row       — text input + send button
 *
 * Contract compliance:
 *   §05 §3   — CSS prefix ai- claimed in AppTheme / workflowPanels
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §05 §7.6 — No independent <style> injection (CSS lives in workflowPanels.ts)
 *   §01 §2   — Read-only; all mutations via the legacy command manager
 *   §04 §1   — Modification declaration issued in session plan
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { aiService, allChatCapabilities } from '@pryzm/ai-host';
import { commandProposalStore } from '@pryzm/command-registry';
import { CommandProposal, CommandType } from '@pryzm/command-registry';
import { aiApprovalStore } from '@pryzm/ai-host';
import { AIResponseParser } from '@pryzm/ai-host';
// §ADR-0313 — zero-token tier 0/1 command resolution in front of the LLM path.
import { tryHandleZeroToken, type ChatTurnFacts } from './ZeroTokenChatBridge';
// §CHAT-ATTACH (L-10904..L-10908) — the founder's "photo + sentence". The chat had
// NO file input at all; every other piece of the path was already live.
import {
    clearChatAttachment,
    consumeChatAttachment,
    describeAttachment,
    getChatAttachment,
    setChatAttachment,
} from './chatFacadeAttachment';
import { setChatAttachmentQuad } from './chatFacadeAttachment.js';
import { pickFacadeCorners } from './chatFacadeCornerPicker.js';
// The LANGUAGE half of "the sentence asked for a photograph". Whether one is
// ATTACHED is UI state this panel holds; the rule itself is L2 and is read, never
// restated here (a client may not own a measurement rule).
import { missingImageRefusal, readImageReference } from '@pryzm/ai-host';
// §OPENED-REGION (L-880) / C83 §4.1.3 — the accessor for this panel's own
// `ZeroTokenUiHooks` pair, so code outside `createAIPanel` reaches the SAME prompt.
import { registerChatPromptHost } from './chatPromptHost';
// §PLANNER (RAC U10.2) — the last rung of the ladder, between the zero-token
// tiers and the legacy QueryEngine path.
import { plannerIsConfigured, tryHandleWithPlanner } from './LlmPlannerBridge';
import { getPreviewManager } from '@app/engine/preview/PreviewManager';
import type { ElementSchema } from '@app/engine/preview/PreviewManager';
// C17 CB-8 — the AI panel surfaces the SAME batch catalogue as the CREATE panel,
// dispatched through the SAME path (dispatchBatchEntry → Path-A commandManager.execute).
import {
    groupCatalogue,
    dispatchBatchEntry,
    renderBatchDispatchMessage,
    type BatchDeps,
} from '../create/batchCatalogue';
// §FEAT-WALL-TYPE-BATCH (RAC prep) — two THIN pills ("All walls → type…" /
// "Selected walls → type…") over the `wall.updateSystemTypeBatch` bus command.
// The COMMAND is the product (UpdateWallsSystemTypeBatchCommand — one undo,
// §CONTEXT-DATA-HONESTY partial-failure report); these pills only pick a type,
// resolve the id scope, dispatch, and print the report the handler re-broadcasts.
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
import { selectionBus } from '@pryzm/core-app-model';
import { WALL_TYPE_BATCH_REPORT_EVENT, type WallTypeBatchReport } from '@pryzm/plugin-wall';
// SPEC-SEMANTIC §3.1 / Phase 2 — surface the existing room auto-organise (tag-by-type) flow.
// Loaded LAZILY (dynamic import at the call site) so RoomAutoOrganiser code-splits into
// its own chunk instead of being pulled into the eager AI-panel bundle. The two other call
// sites (RoomPropertySection, CreatePanelLayout) already lazy-load it; a single static import
// here defeated the split (Rollup: "dynamically imported … but also statically imported"). L-408.
// #51 (SPEC-APARTMENT-LAYOUT-GENERATOR §11/§12) — the AI apartment-layout flow.
// Single shared trigger (also exposed as the console command
// pryzmGenerateApartmentLayout()), so the leaf + console behave identically.
import { triggerApartmentLayout } from '../apartment-layout/apartmentLayoutTrigger';
import { generateApartmentFromScratch } from '../apartment-layout/apartmentFromScratch';
import { toggleDesignParamsPanel } from '../apartment-layout/DesignParamsPanel';
import { triggerFurnishWithPrompt } from '../furnish-layout/furnishLayoutTrigger';
// §OFFICE-ARCH-FURNISH-SPLIT (SPEC-OFFICE-GENERATION-ENGINE §1/§2) — the two office commands in
// the AI dropdown: Command 1 (Generate Office Architecture) drives the office generator; Command 2
// (Furnish Office) furnishes the last-built architecture without regenerating it.
import { generateOfficeBuilding } from '../office-building/officeBuildingTrigger';
import { triggerFurnishOffice } from '../office-building/officeFurnishTrigger';
import { triggerLightingLayout } from '../lighting-layout/lightingLayoutTrigger';
import { triggerCeilingLayout } from '../ceiling-layout/ceilingLayoutTrigger';
// Dev-only test modals — surface the Family Platform pipeline + apartment
// validator framework as AI Panel pills (no DevTools required). The
// underlying functions are the SAME ones exposed as __pryzmFamilyPipeline /
// __pryzmValidateLayout in apps/editor/src/dev/installPryzmTestFunctions.ts.
import { openFamilyPlatformTestModal } from '../dev/familyPlatformTestModal';
import { openValidateLayoutTestModal } from '../dev/validateLayoutTestModal';
// DOC-AUTO — the "Documentation" AI command: auto-generate the documentation set
// (per-level plans + cropped room plans now; building elevations + set-out + PDF queued).
import { generateDocumentationSet, generateFloorPlansPerLevel, generateBuildingElevations } from '../documentation/generateDocumentationSet';
// §DOC-ROOM-INTERIOR-ELEVATIONS (2026-06-26) — opens the scope-picker modal (All rooms /
// This level / a specific room) then generates one interior elevation per room wall,
// centered on each room. Mirrors "Building elevations" but for room interiors.
import { triggerRoomInteriorElevations } from '../documentation/roomInteriorElevationTrigger';
// §FEAT-AUTODIMENSION-P1 (L-138) — deterministic AutoDimension engine executor:
// plans a non-redundant exterior chain + opening dims over the active level's
// walls (@pryzm/auto-dimension) and creates them in one undoable batch.
// §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263) — one entry point, routed by view type.
import { autoDimensionActiveView } from '../documentation/autoDimensionActiveView';
// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — the sibling batch executor: tags the ACTIVE
// view's doors/windows/walls (marks resolved from the model, one undo). A tagged plan
// is what makes a drawing SCHEDULABLE — the tag is the join to the schedule (C28).
import { autoTagActiveView } from '../documentation/autoTagActiveView';
// C27 INS-α-5 — dev surface for the Master Tree (single tree component
// per C27 §1.2).  Opens a modal that mounts the live ModelTreeComponent +
// shows the InspectSelection payload on each click.
import { openModelTreeTestModal } from '../dev/modelTreeTestModal';
// C24 SHT-α-5 — dev surface for the Sheet Composition Engine. Opens a
// modal that runs `buildSheetFromRooms` over the project's rooms and
// renders the result inline via `sheetToSvgWithContent`.
import { openSheetGeneratorTestModal } from '../dev/sheetGeneratorTestModal';
// C29 PDF-α-2 — dev surface for the PDF Vector Export engine. Opens a
// modal that composes a sheet from the project's rooms and emits a
// download-able vector PDF via `sheetToPdfBytes`.
import { openPdfExportTestModal } from '../dev/pdfExportTestModal';
// BIM 2/3 D-α-4 — dev surface for the Apartment Data Panel (read-only
// first slice). Opens a modal that browses live ApartmentParameters +
// RoomParameters from the runtime stores; live editing is D-α-5.
import { openApartmentDataTestModal } from '../dev/apartmentDataTestModal';
import { validationFailureText, validationSummaryFor } from './proposalRefusalText.js';

// ─── Command-Aware Suggestion Tree ───────────────────────────────────────────
//
// Each node maps to a real QueryEngine natural language pattern.
// Leaf nodes either auto-send a query or pre-fill the input.

export interface SuggestionNode {
    label: string;                  // Text shown on the pill
    hint?: string;                  // Small secondary text
    query?: string;                 // Complete query to send (autoSend=true sends it immediately)
    autoSend?: boolean;             // If true, send the query immediately on click
    prefill?: string;               // Pre-fill the input with this text (for partial queries)
    children?: SuggestionNode[];    // Sub-options (drills down to next level)
    category?: string;              // Visual grouping
    isHubList?: boolean;            // Render children as vertical scrollable list (All Commands hub)
    scopeBadge?: string;            // Right-side badge: 'batch' | 'pick levels' | 'manual'
    prompt?: string;                // Question shown above options in parametric flow
    action?: () => void;            // C17 CB-8 — direct catalogue dispatch (no NL query)
}

// Full command tree — sourced from actual QueryEngine patterns.
//
// ⚠ §DRAIN (RAC U10.3) — THIS TREE IS A SECOND SOURCE OF TRUTH, and it is the
// older one. Every node below was hand-transcribed from a `QueryEngine` regex.
// The chat's abilities now live in `ChatCapabilityRegistry`, and the resolution
// ladder answers BEFORE `aiService.query()` ever runs — so a pill whose query
// the ladder claims no longer reaches the pattern it was written for.
// `QueryEngineDrain.spec.ts` classifies every one of these queries and pins the
// result, including the phrasings the ladder currently MISREADS. Nothing here
// is deleted on suspicion: a pattern is only removed once the inventory proves
// it unreachable AND its replacement handles the sentence correctly.
export const COMMAND_TREE: SuggestionNode[] = [
    {
        label: 'Create',
        hint: 'levels, grids, slabs, walls, wardrobes…',
        category: 'create',
        children: [
            {
                label: 'Levels',
                hint: 'add floor levels to the model',
                children: [
                    { label: '5 levels @ 3m',   query: 'create 5 levels at 3m',   autoSend: true },
                    { label: '8 levels @ 3m',   query: 'create 8 levels at 3m',   autoSend: true },
                    { label: '10 levels @ 3m',  query: 'create 10 levels at 3m',  autoSend: true },
                    { label: '10 levels @ 3.5m', query: 'create 10 levels at 3.5m', autoSend: true },
                    { label: '15 levels @ 4m',  query: 'create 15 levels at 4m',  autoSend: true },
                    { label: '20 levels @ 3m',  query: 'create 20 levels at 3m',  autoSend: true },
                    { label: 'Custom…',          prefill: 'create ' },
                ],
            },
            {
                label: 'Structural Grid',
                hint: 'create a structural grid system',
                children: [
                    { label: 'Default grid system', query: 'create grid system', autoSend: true },
                    { label: '5×5 @ 8m×8m',    query: 'create grid system: 5 x-grids at 8m spacing, 5 y-grids at 8m spacing',   autoSend: true },
                    { label: '6×4 @ 8m×10m',   query: 'create grid system: 6 x-grids at 8m spacing, 4 y-grids at 10m spacing',  autoSend: true },
                    { label: '4×4 @ 6m×6m',    query: 'create grid system: 4 x-grids at 6m spacing, 4 y-grids at 6m spacing',   autoSend: true },
                    { label: '10×5 @ 5m×5m',   query: 'create grid system: 10 x-grids at 5m spacing, 5 y-grids at 5m spacing',  autoSend: true },
                    { label: 'Only X grids', query: 'create 5 x-grids at 8m spacing', autoSend: true },
                    { label: 'Only Y grids', query: 'create 4 y-grids at 6m spacing', autoSend: true },
                    { label: 'Custom…',          prefill: 'create grid system: ' },
                ],
            },
            {
                label: 'Delete grids',
                hint: 'remove all structural grids',
                query: 'delete all grids',
                autoSend: true,
            },
            {
                label: 'Floors on all levels',
                hint: 'create slabs on every level',
                query: 'create slabs in all levels',
                autoSend: true,
            },
            {
                // SPEC-SEMANTIC §3.1 / Phase 2 — auto-tag rooms by inferred type
                // (RoomTypeInferenceEngine → SET_ROOM_OCCUPANCY) via the existing modal.
                label: 'Auto-organise rooms',
                hint: 'tag all rooms by type on the active level',
                action: () => {
                    const lid = (window.bimManager as { getActiveLevel?: () => { id: string } | undefined } | undefined)
                        ?.getActiveLevel?.()?.id;
                    if (lid) {
                        void import('../property-inspector/RoomAutoOrganiser').then(m => {
                            m.openAutoOrganiseModal(lid);
                        });
                    } else {
                        window.runtime?.events?.emit('pryzm:toast', {
                            message: 'No active level — create or open a level first.',
                            severity: 'error',
                        });
                    }
                },
            },
            {
                // #51 (SPEC-APARTMENT-LAYOUT-GENERATOR §11) — generate AI interior
                // layouts from the active level's exterior shell; the §11 modal
                // shows ranked/scored options to pick from.
                label: 'Generate apartment layout (AI)',
                hint: 'AI interior layouts from the level shell — pick one to build',
                action: () => { triggerApartmentLayout(); },
            },
            {
                // A.5.g.2 — generate from an EMPTY project: draws a default
                // exterior shell (10×8 m) THEN runs the generator inside it, so
                // no pre-drawn walls are needed. The footprint is the seam the
                // GIS site-boundary will feed ("apartment from the 3D boundary").
                label: 'Generate apartment (from scratch)',
                hint: 'no walls needed — draws a default 10×8 m shell, then generates',
                action: () => { void generateApartmentFromScratch(); },
            },
            {
                // §OFFICE-ARCH-FURNISH-SPLIT (SPEC-OFFICE-GENERATION-ENGINE §1/§2) — Command 1.
                // Generates the office ARCHITECTURE only (façade/glazing · walls · roof · doors ·
                // structural core · lift shafts · staircases · toilets · support rooms · circulation
                // corridors + glazed office enclosures). NO furniture — run "Furnish Office" after.
                label: 'Generate Office Architecture (AI)',
                hint: 'circular office tower — architecture only (core · stairs · lifts · WCs · circulation)',
                action: () => { void generateOfficeBuilding(null, {}); },
            },
            {
                // §OFFICE-ARCH-FURNISH-SPLIT — Command 2. Furnish the LAST-built office architecture
                // with desks/chairs/reception/collab/cafe — WITHOUT regenerating architecture.
                label: 'Furnish Office (AI)',
                hint: 'add desks · chairs · reception · collaboration · cafe to the built office',
                action: () => { triggerFurnishOffice(); },
            },
            {
                // A.25.1/A.25.2 — Living Design Parameters: open the slider panel so
                // the user can tune the generated layout (daylight / privacy / kitchen
                // / compactness) and re-generate live. Was console-only
                // (pryzmToggleDesignParams) — now discoverable from the AI panel.
                label: '🎛 Tune layout — design parameters',
                hint: 'sliders: daylight · privacy · kitchen · compactness → re-generates',
                action: () => { toggleDesignParamsPanel(); },
            },
            {
                // #54 D-CE — auto-place ONE ceiling slab per ceilable room on
                // the active level. Auto-fires after "Generate apartment layout"
                // too, so a manual trigger is only needed for hand-drawn walls.
                label: 'Apply ceilings (AI)',
                hint: 'auto-place one ceiling slab per room',
                action: () => { triggerCeilingLayout(); },
            },
            {
                // #52 D-FLE — auto-place furniture in every furnishable room on
                // the active level. Auto-fires after "Apply ceilings" (which
                // itself auto-fires after the apartment generator).
                label: 'Furnish all rooms (AI)',
                hint: 'auto-place furniture + lighting (ceiling + floor lamps) per room',
                // A.21.D28 #7 — ask the user to furnish the ACTIVE floor (default)
                // or ALL floors. With a single level the prompt is skipped.
                action: () => { triggerFurnishWithPrompt(); },
            },
            {
                // #53 D-LE — auto-place a ceiling fixture in every room.
                // Auto-fires after "Furnish all rooms" too.
                label: 'Light all rooms (AI)',
                hint: 'auto-place one ceiling fixture per room',
                action: () => { triggerLightingLayout(); },
            },
            {
                // Manual full-pipeline: ceilings + furniture + lighting in one
                // click for hand-drawn walls (no apartment-generator run needed).
                label: 'Ceil + furnish + light all rooms (AI)',
                hint: 'one click — ceilings, then furniture, then auto-light',
                action: () => {
                    triggerCeilingLayout();
                    // Furniture auto-fires on `ceiling.layout-executed`, and
                    // lighting auto-fires on `furnish.layout-executed`.
                },
            },
            {
                label: 'Perimeter walls',
                hint: 'walls around all slabs',
                children: [
                    { label: 'Solid walls on all slabs',   query: 'create walls on all slabs',         autoSend: true },
                    { label: 'Solid walls around slab perimeter', query: 'create walls on the perimeter of slab', autoSend: true },
                    { label: 'Solid walls by ground floor slab', query: 'create walls by ground floor slab', autoSend: true },
                    { label: 'Curtain walls on all slabs', query: 'create curtain walls on all slabs',  autoSend: true },
                    { label: 'Curtain walls on slab', query: 'create curtain walls on slab', autoSend: true },
                    { label: 'Curtain walls by ground floor slab', query: 'create curtain walls by ground floor slab', autoSend: true },
                ],
            },
            {
                label: 'Wall between grid marks',
                hint: 'e.g. Mark (A) and Mark (B)',
                prefill: 'create wall between Mark (',
            },
            {
                label: 'Wardrobe sections',
                hint: 'requires an existing/selected wardrobe',
                children: [
                    { label: '2 sections with shelves', query: 'add 2 sections wardrobe with shelves', autoSend: true },
                    { label: '3 sections with drawers', query: 'add 3 sections wardrobe with drawers', autoSend: true },
                    { label: '2 sections with hanger', query: 'add 2 sections wardrobe with hanger', autoSend: true },
                    { label: 'Custom…', prefill: 'add ' },
                ],
            },
        ],
    },
    {
        label: 'Modify',
        hint: 'slabs, curtain walls, wardrobes…',
        category: 'modify',
        children: [
            {
                label: 'Slab thickness',
                hint: 'set all slab thickness',
                children: [
                    { label: '0.15m', query: 'set all slabs thickness to 0.15m', autoSend: true },
                    { label: '0.2m',  query: 'set all slabs thickness to 0.2m',  autoSend: true },
                    { label: '0.25m', query: 'set all slabs thickness to 0.25m', autoSend: true },
                    { label: '0.3m',  query: 'set all slabs thickness to 0.3m',  autoSend: true },
                    { label: 'Custom…', prefill: 'set all slabs thickness to ' },
                ],
            },
            {
                label: 'Slab color',
                hint: 'change color of all slabs',
                children: [
                    { label: 'White', query: 'make all slabs white', autoSend: true },
                    { label: 'Gray',  query: 'make all slabs gray',  autoSend: true },
                    { label: 'Blue',  query: 'make all slabs blue',  autoSend: true },
                    { label: 'Hex…',  prefill: 'set all slabs color to #' },
                ],
            },
            {
                label: 'Curtain wall spacing',
                hint: 'grid and thickness controls',
                children: [
                    { label: 'Grid X 1.2m', query: 'set all curtain wall grid x to 1.2m', autoSend: true },
                    { label: 'Grid Y 1.2m', query: 'set all curtain wall grid y to 1.2m', autoSend: true },
                    { label: 'Panel thickness 0.05m', query: 'set all curtain wall panel thickness to 0.05m', autoSend: true },
                    { label: 'Mullion thickness 0.08m', query: 'set all curtain wall mullion thickness to 0.08m', autoSend: true },
                ],
            },
            {
                label: 'Curtain wall placement',
                hint: 'height and base offset',
                children: [
                    { label: 'Height 4m', query: 'set all curtain wall height to 4m', autoSend: true },
                    { label: 'Base offset 0.2m', query: 'set all curtain wall base offset to 0.2m', autoSend: true },
                    { label: 'Color white', query: 'set all curtain wall color to white', autoSend: true },
                    { label: 'Material glass', query: 'set all curtain wall material to glass', autoSend: true },
                ],
            },
            {
                label: 'Wardrobe',
                hint: 'selected or nearest wardrobe',
                children: [
                    { label: 'Modify existing wardrobe', query: 'modify the existing wardrobe', autoSend: true },
                    { label: 'Reconfigure wardrobe', query: 'reconfigure wardrobe', autoSend: true },
                    { label: 'Add lighting', query: 'add lighting to wardrobe', autoSend: true },
                    { label: 'Add mirror', query: 'add mirror to wardrobe', autoSend: true },
                    { label: 'Custom…', prefill: 'modify wardrobe ' },
                ],
            },
        ],
    },
    {
        label: 'Visibility',
        hint: 'hide, isolate, highlight, restore',
        category: 'visibility',
        children: [
            {
                label: 'By level',
                hint: 'level name, ID, or number',
                children: [
                    { label: 'Hide level 1', query: 'hide all elements in level 1', autoSend: true },
                    { label: 'Isolate level 2', query: 'isolate level 2', autoSend: true },
                    { label: 'Highlight level 3', query: 'highlight elements in level 3', autoSend: true },
                    { label: 'Custom hide…', prefill: 'hide all elements in level ' },
                    { label: 'Custom isolate…', prefill: 'isolate level ' },
                ],
            },
            {
                label: 'By category',
                hint: 'walls, slabs, doors, furniture…',
                children: [
                    { label: 'Hide walls', query: 'hide all walls', autoSend: true },
                    { label: 'Isolate doors', query: 'isolate all doors', autoSend: true },
                    { label: 'Highlight slabs', query: 'highlight all slabs', autoSend: true },
                    { label: 'Select beams', query: 'select all beams', autoSend: true },
                    { label: 'Custom…', prefill: 'isolate all ' },
                ],
            },
            {
                label: 'By type',
                hint: 'category type value',
                children: [
                    { label: 'Isolate single doors', query: 'isolate doors type single', autoSend: true },
                    { label: 'Isolate exterior walls', query: 'isolate walls type exterior', autoSend: true },
                    { label: 'Hide wardrobes', query: 'hide furniture type wardrobe', autoSend: true },
                    { label: 'Custom…', prefill: 'isolate walls type ' },
                ],
            },
            {
                label: 'By height',
                hint: 'taller than N meters',
                children: [
                    { label: 'Isolate doors > 2m', query: 'isolate doors higher than 2 meters', autoSend: true },
                    { label: 'Highlight walls > 3m', query: 'highlight walls taller than 3m', autoSend: true },
                    { label: 'Custom…', prefill: 'isolate walls taller than ' },
                ],
            },
            {
                label: 'Restore all',
                hint: 'cancel isolation',
                query: 'restore all',
                autoSend: true,
            },
        ],
    },
    {
        label: 'Query',
        hint: 'ask about the model',
        category: 'query',
        children: [
            { label: 'Summarise model',  query: 'Summarise the building model',           autoSend: true },
            { label: 'Decisions log',    query: 'What design decisions have been made?',  autoSend: true },
            { label: 'Count elements',   query: 'How many elements are in the model?',    autoSend: true },
            { label: 'List levels',      query: 'What levels exist in the model?',        autoSend: true },
            { label: 'Custom query…',    prefill: '' },
        ],
    },
    {
        // DOC-AUTO — auto-documentation: build the numbered sheet set (per-level plans +
        // building elevations + per-room cropped plan + interior elevations) from the live
        // model. Direct action (C17 CB-8 style) — runs generateDocumentationSet (DS6 plan →
        // view.createDefinition). PDF + sheet placement wiring per C24.1 §4 is the follow-up.
        label: 'Documentation',
        hint: 'auto sheets — plans · elevations · rooms',
        category: 'create',
        children: [
            {
                label: 'Generate documentation set',
                hint: 'per-level plans + cropped room plans (elevations + PDF next)',
                scopeBadge: 'batch',
                action: () => {
                    const rt = (window as unknown as { runtime?: unknown }).runtime;
                    if (rt) { generateDocumentationSet(rt as Parameters<typeof generateDocumentationSet>[0]); }
                    else { (window as unknown as { runtime?: { events?: { emit(k: string, p: unknown): void } } }).runtime?.events?.emit('pryzm:toast', { message: 'Runtime not ready.', severity: 'error' }); }
                },
            },
            {
                // §DOC-AI-COMMAND-WIRE (2026-06-24) — was an autoSend NL query QueryEngine
                // has no pattern for ("I'm not sure how to help with that yet."). Now a direct
                // action (C17 CB-8 style), mirroring "Generate documentation set" → real bus verb.
                label: 'Floor plan per level',
                hint: 'one plan view per level',
                scopeBadge: 'batch',
                action: () => {
                    const rt = (window as unknown as { runtime?: unknown }).runtime;
                    if (rt) { generateFloorPlansPerLevel(rt as Parameters<typeof generateFloorPlansPerLevel>[0]); }
                    else { (window as unknown as { runtime?: { events?: { emit(k: string, p: unknown): void } } }).runtime?.events?.emit('pryzm:toast', { message: 'Runtime not ready.', severity: 'error' }); }
                },
            },
            {
                // §DOC-AI-COMMAND-WIRE (2026-06-24) — see above; now creates the 4 N/S/E/W
                // exterior elevation views via view.createDefinition (viewType 'elevation').
                label: 'Building elevations',
                hint: 'four exterior N/S/E/W elevations',
                scopeBadge: 'batch',
                action: () => {
                    const rt = (window as unknown as { runtime?: unknown }).runtime;
                    if (rt) { generateBuildingElevations(rt as Parameters<typeof generateBuildingElevations>[0]); }
                    else { (window as unknown as { runtime?: { events?: { emit(k: string, p: unknown): void } } }).runtime?.events?.emit('pryzm:toast', { message: 'Runtime not ready.', severity: 'error' }); }
                },
            },
            {
                // §FEAT-AUTODIMENSION-P1 (L-138) — deterministic AutoDimension engine.
                // §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263) — ONE action, routed by
                // the ACTIVE VIEW (`autoDimensionActiveView`): a plan gets the
                // horizontal rule set (overall + exterior chain + opening chain +
                // opening locations); an elevation gets the VERTICAL rule set (overall
                // height + floor-to-floor/level datums + typical sill & head), gated by
                // the view's detail level (P7/C09). Same engine, same commands, same
                // render sink, ONE undo. A second "auto-dimension elevation" button
                // would push the strategy choice onto the user and re-create exactly the
                // plan-first bolt-on this ticket exists to end.
                label: 'Auto-dimension view',
                hint: 'plan: chains + openings · elevation: heights + sill/head (one undo)',
                scopeBadge: 'batch',
                action: () => {
                    const rt = (window as unknown as { runtime?: unknown }).runtime;
                    if (rt) { autoDimensionActiveView(rt as Parameters<typeof autoDimensionActiveView>[0]); }
                    else { (window as unknown as { runtime?: { events?: { emit(k: string, p: unknown): void } } }).runtime?.events?.emit('pryzm:toast', { message: 'Runtime not ready.', severity: 'error' }); }
                },
            },
            {
                // §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — the tag sibling of Auto-dimension,
                // and deliberately built the same way: ONE view-aware action, not one button
                // per view type. `autoTagActiveView` asks the ACTIVE VIEW what it is (plan →
                // anchors + leaders in world XZ; elevation → anchors + leaders in the FAÇADE
                // plane) and what it wants tagged (P7/C09 — the view's annotation-category
                // intent, carried by its view template). The marks are resolved from the
                // element's real record (type mark by default — the reference convention —
                // with the instance mark always carried), so the tagged drawing JOINS to the
                // door/window/wall schedule (C28). Running it twice is a no-op; deleting a
                // tagged element removes its tag. One batch = ONE undo (C16).
                label: 'Auto-tag view',
                hint: 'doors · windows · walls — marks from the model (one undo)',
                scopeBadge: 'batch',
                action: () => {
                    const rt = (window as unknown as { runtime?: unknown }).runtime;
                    if (rt) { autoTagActiveView(rt as Parameters<typeof autoTagActiveView>[0]); }
                    else { (window as unknown as { runtime?: { events?: { emit(k: string, p: unknown): void } } }).runtime?.events?.emit('pryzm:toast', { message: 'Runtime not ready.', severity: 'error' }); }
                },
            },
            {
                // §DOC-ROOM-INTERIOR-ELEVATIONS (2026-06-26) — opens a scope modal then
                // creates one interior elevation per room wall, centered on each room.
                // Sibling of "Building elevations" (exterior) but for room interiors.
                label: 'Interior elevations per room',
                hint: 'per-room interior elevations (scope picker)',
                scopeBadge: 'batch',
                action: () => {
                    const rt = (window as unknown as { runtime?: unknown }).runtime;
                    if (rt) { triggerRoomInteriorElevations(rt as Parameters<typeof triggerRoomInteriorElevations>[0]); }
                    else { (window as unknown as { runtime?: { events?: { emit(k: string, p: unknown): void } } }).runtime?.events?.emit('pryzm:toast', { message: 'Runtime not ready.', severity: 'error' }); }
                },
            },
            { label: 'Export sheets to PDF',    query: 'export all sheets to pdf',                 autoSend: true },
            { label: 'Ask about documentation…', prefill: 'documentation ' },
        ],
    },
    {
        label: 'All commands',
        hint: 'browse every command family',
        category: 'all-commands',
        isHubList: true,
        children: [
            {
                label: 'Views + templates',
                hint: 'views, templates, crop, range',
                children: [
                    { label: 'Create floor plan view',   query: 'create floor plan view',            autoSend: true },
                    { label: 'Create section view',      query: 'create section view',               autoSend: true },
                    { label: 'Create 3D view',           query: 'create 3d view',                    autoSend: true },
                    { label: 'Duplicate active view',    query: 'duplicate active view',             autoSend: true },
                    { label: 'Apply view template…',     prefill: 'apply view template ' },
                    { label: 'What views exist?',        query: 'list all views in the model',       autoSend: true },
                    { label: 'Ask about views…',         prefill: 'view ' },
                ],
            },
            {
                label: 'Sheets + schedules',
                hint: 'sheets, viewports, exports',
                children: [
                    { label: 'Create new sheet',         query: 'create new sheet',                  autoSend: true },
                    { label: 'Add view to sheet…',       prefill: 'add view to sheet ' },
                    { label: 'Create element schedule',  query: 'create element schedule',           autoSend: true },
                    { label: 'List all sheets',          query: 'list all sheets',                   autoSend: true },
                    { label: 'Export sheets to PDF',     query: 'export all sheets to pdf',          autoSend: true },
                    { label: 'Ask about sheets…',        prefill: 'sheet ' },
                ],
            },
            {
                label: 'VG + visibility rules',
                hint: 'graphics, overrides, filters, rules',
                children: [
                    { label: 'Override element color…',  prefill: 'override element color to ' },
                    { label: 'Hide category…',           prefill: 'hide ' },
                    { label: 'Isolate category…',        prefill: 'isolate ' },
                    { label: 'Create visibility filter', query: 'create visibility filter',          autoSend: true },
                    { label: 'Reset all overrides',      query: 'reset all visibility overrides',   autoSend: true },
                    { label: 'Restore all',              query: 'restore all',                       autoSend: true },
                ],
            },
            {
                label: 'Rooms + layouts',
                hint: 'rooms, zones, boundaries, detection',
                children: [
                    { label: 'Detect all rooms',         query: 'detect all rooms',                  autoSend: true, scopeBadge: 'batch' },
                    { label: 'Tag all rooms',            query: 'tag all rooms',                     autoSend: true, scopeBadge: 'batch' },
                    { label: 'Calculate room areas',     query: 'calculate room areas',              autoSend: true, scopeBadge: 'batch' },
                    { label: 'Place room manually…',     prefill: 'place room at ' },
                    { label: 'List all rooms',           query: 'list all rooms in model',           autoSend: true },
                    { label: 'Ask about rooms…',         prefill: 'room ' },
                ],
            },
            {
                label: 'Stairs + railings',
                hint: 'stairs, flights, landings, railings',
                children: [
                    { label: 'Create stairs between levels', query: 'create stairs between levels', autoSend: true, scopeBadge: 'pick levels' },
                    { label: 'Add railings to all stairs',   query: 'add railings to all stairs',   autoSend: true, scopeBadge: 'batch' },
                    { label: 'Modify stair run…',            prefill: 'modify stair run ' },
                    { label: 'Ask about stairs…',            prefill: 'stair ' },
                ],
            },
            {
                label: 'Beams + columns',
                hint: 'structural frame, beams, columns',
                children: [
                    { label: 'Columns at grid intersections', query: 'place columns at all grid intersections', autoSend: true, scopeBadge: 'batch' },
                    { label: 'Beams on all columns',          query: 'create beams on all columns',            autoSend: true, scopeBadge: 'batch' },
                    { label: 'Structural frame',              query: 'create structural frame',                autoSend: true },
                    { label: 'Ask about structure…',          prefill: 'structure ' },
                ],
            },
            {
                label: 'Doors + windows',
                hint: 'hosted openings, types, orientation',
                children: [
                    { label: 'Place door in wall…',      prefill: 'place door in wall ' },
                    { label: 'Place window in wall…',    prefill: 'place window in wall ' },
                    { label: 'Flip door orientation',    query: 'flip door orientation',             autoSend: true },
                    { label: 'Set all doors type…',      prefill: 'set all doors type to ' },
                    { label: 'Count doors + windows',    query: 'how many doors and windows are in the model', autoSend: true },
                    { label: 'Ask about openings…',      prefill: 'door ' },
                ],
            },
            {
                label: 'Selection operations',
                hint: 'select, isolate, mirror, copy',
                children: [
                    { label: 'Select all walls',         query: 'select all walls',                  autoSend: true },
                    { label: 'Select all by level…',     prefill: 'select all elements on level ' },
                    { label: 'Select all by category…',  prefill: 'select all ' },
                    { label: 'Mirror selected',          query: 'mirror selected elements',          autoSend: true },
                    { label: 'Copy selected…',           prefill: 'copy selected elements ' },
                    { label: 'Isolate selection',        query: 'isolate selected elements',         autoSend: true },
                ],
            },
            {
                label: 'Data Workbench',
                hint: 'parameters, hierarchy, templates',
                children: [
                    { label: 'Export parameters to CSV', query: 'export all parameters to csv',     autoSend: true },
                    { label: 'Create shared parameter…', prefill: 'create shared parameter ' },
                    { label: 'Set parameter value…',     prefill: 'set parameter ' },
                    { label: 'List element parameters',  query: 'list all element parameters',      autoSend: true },
                    { label: 'Ask about data…',          prefill: 'parameter ' },
                ],
            },
            {
                label: 'IFC conversion',
                hint: 'import, export, validate, map',
                children: [
                    { label: 'Import IFC file',          query: 'import ifc file',                   autoSend: true },
                    { label: 'Export model to IFC',      query: 'export model to ifc',               autoSend: true },
                    { label: 'Validate IFC data',        query: 'validate ifc data',                 autoSend: true },
                    { label: 'Map IFC categories',       query: 'map ifc categories',                autoSend: true },
                    { label: 'Ask about IFC…',           prefill: 'ifc ' },
                ],
            },
            {
                label: 'Auditor + catalog',
                hint: 'compliance, requirements, remediation',
                children: [
                    { label: 'Run compliance audit',     query: 'run compliance audit',              autoSend: true },
                    { label: 'Fix all issues',           query: 'fix all compliance issues',         autoSend: true, scopeBadge: 'batch' },
                    { label: 'Browse element catalog',   query: 'open element catalog',              autoSend: true },
                    { label: 'Generate audit report',    query: 'generate audit report',             autoSend: true },
                    { label: 'Ask about compliance…',    prefill: 'compliance ' },
                ],
            },
            {
                label: 'Furniture + plumbing',
                hint: 'furniture, fixtures, casework, handrails',
                children: [
                    { label: 'Place furniture…',         prefill: 'place ' },
                    { label: 'Add sanitary fixtures',    query: 'add sanitary fixtures to all bathrooms', autoSend: true, scopeBadge: 'batch' },
                    { label: 'Create casework…',         prefill: 'create casework ' },
                    { label: 'Add handrail',             query: 'add handrail to stairs',            autoSend: true },
                    { label: 'Ask about furniture…',     prefill: 'furniture ' },
                ],
            },
            {
                label: 'Floors + roofs',
                hint: 'slabs, ceilings, roof, by footprint',
                children: [
                    {
                        label: 'Floors on all levels',
                        hint: 'choose scope',
                        prompt: 'Which levels should floors be created on?',
                        children: [
                            { label: 'All levels in the model',      query: 'create slabs in all levels',                autoSend: true, scopeBadge: 'batch' },
                            { label: 'All slabs on selected levels', prefill: 'create slabs on levels ',                 scopeBadge: 'pick levels' },
                            { label: 'Only levels I specify…',       prefill: 'create slabs in level ',                  scopeBadge: 'manual' },
                        ],
                    },
                    { label: 'Modify slab thickness…',   prefill: 'set all slabs thickness to ' },
                    { label: 'Create roof by footprint', query: 'create roof by footprint',          autoSend: true },
                    { label: 'Add ceilings to rooms',    query: 'add ceilings to all rooms',         autoSend: true, scopeBadge: 'batch' },
                    { label: 'Ask about floors…',        prefill: 'floor ' },
                ],
            },
            {
                label: 'AI element creator',
                hint: 'describe, image-to-element, wizard',
                children: [
                    { label: 'Describe a new element…',  prefill: 'create element: ' },
                    { label: 'Parametric element…',      prefill: 'design parametric ' },
                    { label: 'Wardrobe wizard',          query: 'start wardrobe configuration',      autoSend: true },
                    { label: 'What can I create?',       query: 'What elements can you create for me?', autoSend: true },
                ],
            },
        ],
    },
    {
        // Dev test surface — opens local modals that wrap the same
        // `runFamilyPipeline` + `validateAndFormatLayout` already exposed as
        // __pryzm* DevTools helpers. Surfaces them as pills so a user can
        // exercise the Family Platform pipeline + apartment validator
        // framework directly from the AI Design Assistant.
        label: 'Test (dev)',
        hint: 'dev tools — Family Platform pipeline + apartment validator',
        category: 'test',
        children: [
            {
                label: 'Test Family Pipeline',
                hint: 'paste JSON → run pipeline → see RegisteredFamily',
                action: () => { openFamilyPlatformTestModal(); },
            },
            {
                label: 'Test Layout Validator',
                hint: 'paste apartment DTO → run validator → markdown report',
                action: () => { openValidateLayoutTestModal(); },
            },
            {
                label: 'Test Master Tree',
                hint: 'mount live ModelTreeComponent → click node → see selection',
                action: () => { openModelTreeTestModal(); },
            },
            {
                label: 'Test Sheet Generator',
                hint: 'build a sheet from the project\'s rooms → render inline SVG',
                action: () => { openSheetGeneratorTestModal(); },
            },
            {
                label: 'Generate PDF',
                hint: 'sheetToPdfBytes → Blob download',
                action: () => { openPdfExportTestModal(); },
            },
            {
                label: 'Apartment Data Panel',
                hint: 'read-only BIM 2/3 D-α-4 — apartments + rooms data',
                action: () => { openApartmentDataTestModal(); },
            },
        ],
    },
];

// ─── §DRAIN (RAC U10.3) — the chat's own abilities, GENERATED ────────────────
//
// The hand-written tree above advertises what the QueryEngine could do in 2026.
// This node advertises what the CHAT can do, and it is generated from
// `allChatCapabilities()` — the same registry the resolver, the refusals, the
// coverage gate and the LLM planner's vocabulary are all built from. Adding a
// capability makes it discoverable here on the same commit, which is precisely
// the guarantee the hand-written tree cannot give (c1902a5a: the command
// shipped, the chat's list did not learn about it, and the founder's sentence
// reached nothing).
//
// Each leaf sends the capability's OWN first declared example, so the pill and
// the acceptance suite exercise the identical sentence — a pill that stops
// working is a test that stops passing.
export function chatCapabilityNode(): SuggestionNode {
    const leaves: SuggestionNode[] = allChatCapabilities()
        .filter((cap) => cap.examples.length > 0)
        .map((cap) => ({
            label: cap.description.charAt(0).toUpperCase() + cap.description.slice(1),
            hint: `"${cap.examples[0]}"${cap.destructive ? ' — asks first' : ''}`,
            query: cap.examples[0],
            autoSend: true,
        }));
    return {
        label: 'Chat can…',
        hint: `${leaves.length} abilities, generated from the capability registry`,
        category: 'chat',
        isHubList: true,
        children: leaves,
    };
}

// Stack-based navigation state (each entry = current node's children)
interface SuggestionState {
    stack: Array<{ label: string; nodes: SuggestionNode[]; isHubList?: boolean; prompt?: string }>;
    filterText: string;
}

// ─── Chat message types ───────────────────────────────────────────────────────

interface ChatMessage {
    role: 'user' | 'assistant' | 'card';
    text?: string;
    proposal?: CommandProposal;
    /** Phase 3.3 — element IDs to highlight when user clicks "Highlight Selection" */
    highlightIds?: string[];
    /** Phase 3.1 — ghost proposal shown in this message (Accept/Decline banner) */
    ghostProposal?: ElementSchema[];
}

// ─── createAIPanel ─────────────────────────────────────────────────────────────

export function createAIPanel(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime createAIPanel */): HTMLElement {
    void runtime; /* B-runtime-void createAIPanel — TODO(C.3.x): consume once runtime.persistence is wired — Phase C.3.x */
    // ── Internal state ─────────────────────────────────────────────────────
    const messages: ChatMessage[] = [];
    let suggestionState: SuggestionState = { stack: [], filterText: '' };

    // ── DOM element references ─────────────────────────────────────────────
    let transcriptEl: HTMLElement;
    let pillsRowEl: HTMLElement;
    let levelLabelEl: HTMLElement;
    let inputEl: HTMLInputElement;
    /** §CHAT-ATTACH — the strip above the input that shows the pending photograph.
     *  Empty and `display:none` when nothing is attached, so the chat looks exactly
     *  as it does today until a file is picked. */
    let attachRowEl: HTMLElement;

    // ── Helpers ────────────────────────────────────────────────────────────

    const escapeHtml = (text: string): string => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const scrollTranscript = (): void => {
        // D.7.5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('ai-panel-scroll-transcript', () => {
            if (transcriptEl) transcriptEl.scrollTop = transcriptEl.scrollHeight;
        });
    };

    // ── Transcript rendering ────────────────────────────────────────────────

    const renderTranscript = (): void => {
        if (!transcriptEl) return;
        transcriptEl.innerHTML = '';

        if (messages.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ai-chat-empty';
            empty.textContent = 'Ask me anything about the model. Use the suggestion pills below to get started.';
            transcriptEl.appendChild(empty);
            return;
        }

        messages.forEach((msg, idx) => {
            if (msg.role === 'user') {
                const wrapper = document.createElement('div');
                wrapper.className = 'ai-chat-msg ai-chat-msg--user';

                const labelEl = document.createElement('div');
                labelEl.className = 'ai-chat-msg-label';
                labelEl.textContent = 'You';

                const bubble = document.createElement('div');
                bubble.className = 'ai-chat-bubble';
                bubble.textContent = msg.text ?? '';

                wrapper.appendChild(labelEl);
                wrapper.appendChild(bubble);
                transcriptEl.appendChild(wrapper);
            } else if (msg.role === 'assistant') {
                const wrapper = document.createElement('div');
                wrapper.className = 'ai-chat-msg ai-chat-msg--assistant';

                const labelEl = document.createElement('div');
                labelEl.className = 'ai-chat-msg-label';
                labelEl.textContent = 'PRYZM AI';

                const bubble = document.createElement('div');
                bubble.className = 'ai-chat-bubble';
                bubble.innerHTML = escapeHtml(msg.text ?? '').replace(/\n/g, '<br>');

                // Phase 3.3 — Actionable Logs: "Highlight Selection" button
                if (msg.highlightIds && msg.highlightIds.length > 0) {
                    const highlightBtn = document.createElement('button');
                    highlightBtn.type = 'button';
                    highlightBtn.className = 'ai-highlight-btn';
                    highlightBtn.innerHTML = '<span class="ai-highlight-btn-icon">🎯</span> Highlight Selection';
                    highlightBtn.title = `Highlight ${msg.highlightIds.length} referenced element(s) in the 3D viewport`;
                    highlightBtn.addEventListener('click', () => {
                        const ids = msg.highlightIds!;
                        console.log('[AIPanel] Highlighting', ids.length, 'element(s) from AI log');
                        ids.forEach((elementId, index) => {
                            setTimeout(() => {
                                runtime?.events?.emit('pryzm-element-selected', { elementId, source: 'ai' });
                            }, index * 50);
                        });
                    });
                    bubble.appendChild(highlightBtn);
                }

                // Phase 3.1 — Ghost Preview: Accept/Decline banner
                if (msg.ghostProposal && msg.ghostProposal.length > 0) {
                    const banner = document.createElement('div');
                    banner.className = 'pvw-banner';

                    const top = document.createElement('div');
                    top.className = 'pvw-banner-top';

                    const iconEl = document.createElement('span');
                    iconEl.className = 'pvw-banner-icon';
                    iconEl.textContent = '✨';

                    const labelText = document.createElement('span');
                    labelText.className = 'pvw-banner-label';
                    labelText.innerHTML = `AI is proposing <span class="pvw-banner-count">${msg.ghostProposal.length}</span> element(s) — visible as ghost preview in the 3D scene.`;

                    top.appendChild(iconEl);
                    top.appendChild(labelText);
                    banner.appendChild(top);

                    const actions = document.createElement('div');
                    actions.className = 'pvw-actions';

                    const acceptBtn = document.createElement('button');
                    acceptBtn.type = 'button';
                    acceptBtn.className = 'pvw-accept-btn';
                    acceptBtn.textContent = 'Accept All';
                    acceptBtn.title = 'Materialise ghost elements as real BIM elements';
                    acceptBtn.addEventListener('click', async () => {
                        acceptBtn.disabled = true;
                        acceptBtn.textContent = 'Applying…';
                        try {
                            await getPreviewManager().accept();
                            banner.remove();
                            addMessage('assistant', `Accepted ${msg.ghostProposal!.length} proposed element(s).`);
                        } catch (err) {
                            acceptBtn.disabled = false;
                            acceptBtn.textContent = 'Accept All';
                            addMessage('assistant', `Accept failed: ${err}`);
                        }
                    });

                    const declineBtn = document.createElement('button');
                    declineBtn.type = 'button';
                    declineBtn.className = 'pvw-decline-btn';
                    declineBtn.textContent = 'Decline';
                    declineBtn.title = 'Clear ghost preview — no elements created';
                    declineBtn.addEventListener('click', () => {
                        getPreviewManager().decline();
                        banner.remove();
                        addMessage('assistant', 'Proposal declined — preview cleared.');
                    });

                    actions.appendChild(acceptBtn);
                    actions.appendChild(declineBtn);
                    banner.appendChild(actions);
                    bubble.appendChild(banner);
                }

                wrapper.appendChild(labelEl);
                wrapper.appendChild(bubble);
                transcriptEl.appendChild(wrapper);
            } else if (msg.role === 'card' && msg.proposal) {
                transcriptEl.appendChild(buildInlineCard(msg.proposal, idx));
            }
        });

        scrollTranscript();
    };

    // ── Inline action card (Task 9.4) ──────────────────────────────────────

    const buildInlineCard = (proposal: CommandProposal, msgIdx: number): HTMLElement => {
        const isValid = proposal.validation.ok;

        const card = document.createElement('div');
        card.className = 'ai-inline-card';

        const hdr = document.createElement('div');
        hdr.className = 'ai-inline-card-header';

        const icon = document.createElement('span');
        icon.className = 'ai-inline-card-icon';
        icon.textContent = '🏗';

        const titleEl = document.createElement('span');
        titleEl.className = 'ai-inline-card-title';
        titleEl.textContent = proposal.intentType;

        hdr.appendChild(icon);
        hdr.appendChild(titleEl);
        card.appendChild(hdr);

        const detail = document.createElement('div');
        detail.className = 'ai-inline-card-detail';
        detail.textContent = proposal.rationale;
        card.appendChild(detail);

        if (!isValid) {
            const errEl = document.createElement('div');
            errEl.className = 'ai-card-error';
            // §REFUSAL-IDENTITY (C58 §1.13) — see proposalRefusalText.ts. No manufactured
            // generic "no"; the refusing command is named.
            errEl.textContent = validationFailureText(proposal.validation, proposal.command.type);
            errEl.setAttribute('data-refusal-command', proposal.command.type);
            errEl.setAttribute(
                'data-refusal-reason-stated',
                proposal.validation.reason ? 'true' : 'false',
            );
            card.appendChild(errEl);
        }

        const actionsRow = document.createElement('div');
        actionsRow.className = 'ai-inline-card-actions';

        const acceptBtn = document.createElement('button');
        acceptBtn.type = 'button';
        acceptBtn.className = 'ai-inline-card-accept';
        acceptBtn.textContent = 'Accept';
        acceptBtn.disabled = !isValid;
        acceptBtn.title = 'Accept (Enter)';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'ai-inline-card-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.title = 'Cancel (Escape)';

        // Accept — triggers on button click, Enter, or Tab
        const doAccept = (e: Event): void => {
            e.preventDefault();
            if (!isValid) return;
            approveProposal(proposal);
            messages.splice(msgIdx, 1);
            renderTranscript();
        };

        acceptBtn.addEventListener('click', doAccept);

        // Cancel — triggers on button click or Escape
        const doCancel = (): void => {
            commandProposalStore.remove(proposal.id);
            messages.splice(msgIdx, 1);
            renderTranscript();
        };

        cancelBtn.addEventListener('click', doCancel);

        // Keyboard shortcuts for inline card
        const keyHandler = (e: KeyboardEvent): void => {
            if (!card.isConnected) { document.removeEventListener('keydown', keyHandler); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); doAccept(e); document.removeEventListener('keydown', keyHandler); }
            if (e.key === 'Escape') { doCancel(); document.removeEventListener('keydown', keyHandler); }
        };
        document.addEventListener('keydown', keyHandler);

        actionsRow.appendChild(acceptBtn);
        actionsRow.appendChild(cancelBtn);
        card.appendChild(actionsRow);

        return card;
    };

    // ── Proposal approval logic ─────────────────────────────────────────────

    const approveProposal = (proposal: CommandProposal): void => {
        const manager = window.commandManager || // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
                        window.commandContext?.commandManager || // TODO(E.5.x): replace with runtime.bus.executeCommand (commandContext collapsed) — Phase E.5.x
                        window.bimService?.props?.commandManager; // TODO(D.4): replace via EngineBootstrap split — bimService destroyed in D.4 — Phase D.4

        if (!manager) {
            console.error('[AIPanel] CommandManager not found');
            addMessage('assistant', 'Error: CommandManager not available. Please refresh.');
            return;
        }

        try {
            const cmd = proposal.command;
            if (!cmd || typeof cmd.execute !== 'function') {
                addMessage('assistant', 'Error: Invalid command structure in proposal.');
                return;
            }

            // Auto-execute parent wall for openings
            if (cmd.type === CommandType.ADD_OPENING && cmd.targetIds[0]) {
                const wallId = cmd.targetIds[0];
                const wallStore = window.wallStore || window.commandContext?.stores?.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
                const exists = wallStore ? !!wallStore.getById(wallId) : false;
                if (!exists) {
                    const parentProposal = commandProposalStore.getAll().find(
                        (p: CommandProposal) => p.command.type === CommandType.CREATE_WALL && p.command.targetIds[0] === wallId
                    );
                    if (parentProposal) {
                        const r = manager.execute(parentProposal.command, { source: 'AI_PROPOSAL', proposalId: parentProposal.id });
                        if (r.success) commandProposalStore.remove(parentProposal.id);
                    }
                }
            }

            const result = manager.execute(cmd, { source: 'AI_PROPOSAL', proposalId: proposal.id });

            if (result.success) {
                aiApprovalStore.append({
                    id: crypto.randomUUID(),
                    proposalId: proposal.id,
                    intent: proposal.intentType as any,
                    commandType: proposal.command.type,
                    commandSnapshot: proposal.command.serialize(),
                    approvedBy: 'User',
                    approvedAt: new Date().toISOString(),
                    rationale: proposal.rationale,
                    confidence: proposal.confidence,
                    // §REFUSAL-IDENTITY — see ValidatePanel.ts.
                    validationSummary: validationSummaryFor(proposal.validation),
                });
                commandProposalStore.remove(proposal.id);
                addMessage('assistant', `Done! Applied: ${proposal.intentType}`);
                window.runtime?.events?.emit('model-updated', {}); // F.events.8
                window.runtime?.events?.emit('ai-model-update', {}); // F.events.12
                window.runtime?.events?.emit('update-view-browser', {}); // F.events.12
            } else {
                const errorMsg = result.info?.join(', ') || 'Execution failed';
                addMessage('assistant', `Error applying proposal: ${errorMsg}`);
            }
        } catch (err) {
            console.error('[AIPanel] Fatal error during execution:', err);
            addMessage('assistant', `Fatal error: ${err}`);
        }
    };

    // Backward-compat floating approval modal (triggered from window events by other parts of the system)
    const showApprovalModal = (proposal: CommandProposal): void => {
        const popup = document.createElement('div');
        popup.className = 'ai-popup';

        popup.innerHTML = `
            <div class="ai-popup-title">${escapeHtml(proposal.intentType)}</div>
            <div class="ai-popup-subtitle">${escapeHtml(proposal.rationale)}</div>
            <div class="ai-popup-info">Click Approve to apply these changes to your model.</div>
            <div class="ai-popup-actions">
                <button class="ai-popup-btn ai-popup-btn--cancel">Cancel</button>
                <button class="ai-popup-btn ai-popup-btn--approve">Approve</button>
            </div>
        `;

        const [cancelBtn, approveBtn] = popup.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
        cancelBtn.onclick = () => popup.remove();
        approveBtn.onclick = (e) => {
            e.stopPropagation();
            approveProposal(proposal);
            popup.remove();
        };

        document.body.appendChild(popup);

        setTimeout(() => {
            if (document.body.contains(popup)) {
                popup.style.opacity = '0';
                popup.style.transition = 'opacity 0.2s';
                setTimeout(() => popup.remove(), 200);
            }
        }, 20000);
    };

    // ── Message helpers ─────────────────────────────────────────────────────

    const addMessage = (
        role: 'user' | 'assistant',
        text: string,
        extra?: { highlightIds?: string[]; ghostProposal?: ElementSchema[] }
    ): void => {
        messages.push({ role, text, ...extra });
        renderTranscript();
    };

    const addProposalCard = (proposal: CommandProposal): void => {
        messages.push({ role: 'card', proposal });
        renderTranscript();
    };

    // ══ §CHAT-ATTACH (L-10904..L-10908) — the photograph on the next message ══
    //
    // ⭐ THE CHIP MUST BE VISIBLE BEFORE SEND, and that is the whole requirement,
    // not a nicety. An attachment the user cannot SEE is one he cannot know will
    // be used — so he presses Enter not knowing whether he is asking for "a
    // 5-storey building" or "a 5-storey building like this photo". Those are two
    // different requests, and the difference has to be on screen before he commits
    // to one.
    //
    // ⛔ IT REBUILDS RATHER THAN PATCHES, for the same reason `renderTranscript`
    // does: there is exactly one attachment and exactly one place that draws it,
    // so a stale chip (the defect: a removed photo whose chip survives, and rides
    // along with the next sentence) cannot exist.

    /** Draw — or hide — the pending-attachment strip. Safe before the DOM exists. */
    const renderAttachment = (): void => {
        if (!attachRowEl) return;
        attachRowEl.innerHTML = '';
        const att = getChatAttachment();
        if (att === null) {
            attachRowEl.style.display = 'none';
            return;
        }
        attachRowEl.style.display = 'flex';

        const chip = document.createElement('div');
        chip.className = 'ai-chat-attach-chip';

        const thumb = document.createElement('img');
        thumb.className = 'ai-chat-attach-thumb';
        thumb.src = att.previewUrl;
        // The file name is the alt text: a screen reader gets the same identity a
        // sighted user gets from the picture.
        thumb.alt = att.name;
        chip.appendChild(thumb);

        const text = document.createElement('div');
        text.className = 'ai-chat-attach-text';
        const nameLine = document.createElement('div');
        nameLine.className = 'ai-chat-attach-name';
        nameLine.textContent = att.name;
        const metaLine = document.createElement('div');
        metaLine.className = 'ai-chat-attach-meta';
        // ⚠ THE DOWNSCALE IS NAMED HERE, not only in the transcript. The decode
        // caps the long side at 1 200 px and genuinely loses fine texture; a user
        // whose 12 MP photo was measured at 1 200 px is entitled to know BEFORE he
        // sends, not to infer it from a reading that missed what he can see.
        metaLine.textContent =
            att.decoded.scale < 1
                ? `${att.decoded.image.width}×${att.decoded.image.height} · downscaled from ${att.decoded.sourceWidth}×${att.decoded.sourceHeight}`
                : `${att.decoded.image.width}×${att.decoded.image.height} · full resolution`;
        text.appendChild(nameLine);
        text.appendChild(metaLine);

        // §L-11127 — THE FRONT DOOR. Without corners the facade plane is UNKNOWN,
        // C108 §4.3 zeroes every downstream confidence, and the founder's ledger
        // read "confidence 0.00, under the 0.50 floor" — nothing of the photo ever
        // reached the building. Corners are ASKED FOR here, never assumed.
        const cornersLine = document.createElement('div');
        cornersLine.className = 'ai-chat-attach-corners';
        cornersLine.textContent = att.quad === null
            ? 'corners NOT set — the photo will not shape the building until you set them'
            : 'corners set ✓ — facade plane 1.00';
        text.appendChild(cornersLine);
        chip.appendChild(text);

        const cornersBtn = document.createElement('button');
        cornersBtn.type = 'button';
        cornersBtn.className = 'ai-chat-attach-corners-btn' + (att.quad === null ? ' ai-chat-attach-corners-btn--ask' : '');
        cornersBtn.textContent = att.quad === null ? 'Set facade corners' : 'Re-set corners';
        cornersBtn.title = 'Click the four corners of the facade, clockwise from top-left (C108 §3.2)';
        cornersBtn.addEventListener('click', () => {
            void (async () => {
                const quad = await pickFacadeCorners({
                    previewUrl: att.previewUrl,
                    imageWidth: att.decoded.image.width,
                    imageHeight: att.decoded.image.height,
                    name: att.name,
                });
                if (quad === null) return; // cancelled — keep asking, never guess
                setChatAttachmentQuad(quad);
                renderAttachment();
            })();
        });
        chip.appendChild(cornersBtn);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'ai-chat-attach-remove';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove this image from the next message';
        removeBtn.setAttribute('aria-label', `Remove attached image ${att.name}`);
        removeBtn.addEventListener('click', () => {
            clearChatAttachment();
            renderAttachment();
        });
        chip.appendChild(removeBtn);

        attachRowEl.appendChild(chip);

        const hint = document.createElement('div');
        hint.className = 'ai-chat-attach-hint';
        hint.textContent = att.quad === null
            ? 'set the corners, then send — a photo without corners is measured with an UNKNOWN plane'
            : 'will be read as a façade for your next message';
        attachRowEl.appendChild(hint);
    };

    /**
     * Take a file from ANY of the three routes (button, drop, paste) and attach it.
     *
     * ⛔ ONE FUNCTION FOR ALL THREE. Three routes with three error paths is three
     * chances for one of them to fail silently — which is exactly how a drop target
     * ends up looking like it worked. Every refusal reaches the transcript as a
     * sentence, never a console line.
     */
    const attachFile = async (file: File): Promise<void> => {
        const res = await setChatAttachment(file);
        renderAttachment();
        if (!res.ok) {
            addMessage('assistant', res.reason);
            return;
        }
        // Reading starts NOW (see chatFacadeAttachment's header) and finishes while
        // he types. Nothing is announced yet: the chip is the acknowledgement, and a
        // chat line per attach would push his own sentence off the screen.
    };

    // §ADR-0313 — inline Confirm/Cancel card for DESTRUCTIVE zero-token
    // resolutions (delete etc.). Nothing dispatches until Confirm is clicked;
    // Cancel resolves false and the bridge reports "Cancelled".
    const showZeroTokenConfirm = (summary: string): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            if (!transcriptEl) { resolve(false); return; }
            const card = document.createElement('div');
            card.className = 'ai-chat-msg ai-chat-msg--assistant';
            const bubble = document.createElement('div');
            bubble.className = 'ai-chat-bubble';
            const label = document.createElement('div');
            // §PLAN (RAC U6) — a plan's card states its OWN, real undo cost
            // ("3 steps — Ctrl+Z three times"), so the generic single-undo tail
            // would contradict it. Suppressed exactly when the summary already
            // says what undoing costs; every other card is unchanged. The card
            // also renders the plan's per-step lines, hence pre-line.
            label.style.whiteSpace = 'pre-line';
            label.textContent = /ctrl\s*\+\s*z/i.test(summary)
                ? summary
                : `${summary}? This can be undone with Ctrl+Z.`;
            bubble.appendChild(label);
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
            const mkBtn = (text: string, primary: boolean, value: boolean): HTMLButtonElement => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = text;
                b.style.cssText =
                    'padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;' +
                    (primary
                        ? 'background:var(--app-accent, #6600FF);color:#fff;border:none;'
                        : 'background:transparent;color:var(--app-text-muted);border:1px solid var(--app-border, #ccc);');
                b.addEventListener('click', () => {
                    // The bridge's follow-up message ("done" / "cancelled") is the
                    // persistent record; the interactive card removes itself
                    // (renderTranscript rebuilds from `messages` and would wipe it anyway).
                    card.remove();
                    resolve(value);
                });
                return b;
            };
            row.appendChild(mkBtn('Confirm', true, true));
            row.appendChild(mkBtn('Cancel', false, false));
            bubble.appendChild(row);
            card.appendChild(bubble);
            transcriptEl.appendChild(card);
            scrollTranscript();
        });
    };

    // ── Send query ──────────────────────────────────────────────────────────

    const handleSend = async (): Promise<void> => {
        if (!inputEl) return;
        const query = inputEl.value.trim();
        if (!query) return;

        // Reset input + suggestions first
        inputEl.value = '';
        suggestionState = { stack: [], filterText: '' };
        renderSuggestions();

        addMessage('user', query);
        await _executeSend(query);
    };

    // ── Command-aware Suggestion System (Task 9.3) ─────────────────────────

    // C17 CB-8 / DI-1 — batch dispatch deps for the AI panel, resolved from the
    // documented legacy globals (typed shims, not `window as any` — P4). The
    // catalogue performs no window reads of its own; this is the single sink.
    const _bim = window.bimManager as unknown as {
        getActiveLevel?: () => { id: string } | undefined;
        getLevels?: () => Array<{ id: string; elevation: number; height?: number }>;
    } | undefined;
    const _sel = window.selectionManager as unknown as {
        selectedObject?: { userData?: { elementId?: string } } | null;
    } | undefined;
    const batchDeps: BatchDeps = {
        commandManager: (window.commandManager as unknown as BatchDeps['commandManager']) ?? null,
        getActiveLevelId: () => _bim?.getActiveLevel?.()?.id ?? null,
        getLevels: () => _bim?.getLevels?.() ?? [],
        getSelectedElementId: () => _sel?.selectedObject?.userData?.elementId ?? null,
        slabStore: (window.slabStore as unknown as BatchDeps['slabStore']) ?? null,
        getFacadeWallIds: (levelId, orientation) => {
            const svc = window.facadeOrientationService as {
                facadesByOrientation?: (l: string, o: string, n?: number) => Array<{ wallId: string }>;
            } | undefined;
            // §FIX-FACADE-TRUE-NORTH (ADR-0315 U2.1): θ omitted so the service's
            // injected site true-north applies — the literal 0 here made
            // "south-facing" mean PROJECT-south on rotated sites.
            return svc?.facadesByOrientation?.(levelId, orientation)?.map(f => f.wallId) ?? [];
        },
    };

    // Catalogue-sourced "Batch ⚡" branch (C17 §4). Live parameterless entries
    // dispatch directly via the catalogue; phased entries explain their phase.
    // Parameterised entries (levels-N, grid system) keep the existing rich NL
    // pills (Levels / Structural Grid) which offer concrete variants.
    const batchCatalogueNode: SuggestionNode = ((): SuggestionNode => {
        const grouped = groupCatalogue();
        const disciplines: SuggestionNode[] = [];
        for (const [discipline, sys] of grouped) {
            const leaves: SuggestionNode[] = [];
            for (const entries of sys.values()) {
                for (const e of entries) {
                    if (e.params && e.params.length > 0) continue; // parameterised → NL pills
                    if (e.status !== 'live') {
                        leaves.push({
                            label: e.label,
                            hint: `Phase ${e.phase}`,
                            action: () => addMessage('assistant', `"${e.label}" arrives in Phase ${e.phase} of the Semantic Design Assistant.`),
                        });
                    } else {
                        leaves.push({
                            label: e.label,
                            hint: e.prompt,
                            action: () => {
                                // §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the ONE
                                // renderer (batchCatalogue.renderBatchDispatchMessage).
                                // This line used to be `r.ok ? \`Done — ${e.label}.\``,
                                // which printed "Done" over "Created 12 of 25 —
                                // 13 skipped: …". C68 §5.g: "Done" only after a
                                // command reports success, and the report is the
                                // engine's own payload, never re-narrated.
                                const r = dispatchBatchEntry(e, batchDeps);
                                addMessage('assistant', renderBatchDispatchMessage(e, r));
                                if (r.ok) {
                                    window.runtime?.events?.emit('update-view-browser', {}); // F.events.12
                                    window.runtime?.events?.emit('model-updated', {});       // F.events.8
                                }
                            },
                        });
                    }
                }
            }
            if (leaves.length > 0) disciplines.push({ label: discipline, hint: `${leaves.length} batch action(s)`, children: leaves });
        }
        return { label: 'Batch ⚡', hint: 'one-click batch creation (C17 catalogue)', category: 'create', children: disciplines };
    })();

    // ── §FEAT-WALL-TYPE-BATCH (RAC prep) — "walls → type" pills ─────────────
    //
    // THIN wrappers by design: the deliverable is `wall.updateSystemTypeBatch`
    // (UpdateWallsSystemTypeBatchCommand — ONE undo entry, rake-refusals skipped
    // WITH reasons, "Changed N of M — K skipped" report), which the coming RAC
    // chat will dispatch directly. Each pill only (a) resolves its wall-id scope
    // ('all' = every wall on ALL levels; 'selected' = selectionBus.currentIds
    // filtered to walls), (b) offers the live wall-type catalogue (built-ins +
    // user types, read at CLICK time so fresh custom types appear), and
    // (c) prints the handler's re-broadcast report into the chat.
    const dispatchWallTypeBatch = (scope: 'all' | 'selected', typeId: string): void => {
        let wallIds: string[] | 'all';
        if (scope === 'all') {
            wallIds = 'all';
        } else {
            // §FIX-SELECTION-PAYLOAD-INSTANCED-ID builds on RESOLVED element ids —
            // selectionBus.currentIds carries them; filter to walls via the store
            // so a selected slab never inflates the "M" denominator.
            const wallStore = window.wallStore || window.commandContext?.stores?.wallStore; // TODO(E.wall.S): runtime.stores.wall
            const ids = selectionBus.currentIds.filter(id => !!wallStore?.getById?.(id));
            if (ids.length === 0) {
                addMessage('assistant',
                    'No walls selected — click a wall (SHIFT+click to add more, in the 3D or plan view), then try again.');
                return;
            }
            wallIds = ids;
        }
        // One-shot report listener: the bridge handler re-broadcasts the
        // command's honest report for success AND refusal, so the pill never
        // invents its own summary.
        const onReport = (e: Event): void => {
            const detail = (e as CustomEvent).detail as WallTypeBatchReport | undefined;
            const lines = detail?.info?.length ? detail.info.join('\n') : 'Wall type change produced no report.';
            addMessage('assistant', lines);
            if (detail?.success) {
                window.runtime?.events?.emit('model-updated', {}); // F.events.8
            }
        };
        window.addEventListener(WALL_TYPE_BATCH_REPORT_EVENT, onReport, { once: true });
        const dispatched = window.runtime?.bus?.executeCommand('wall.updateSystemTypeBatch', {
            wallIds,
            systemType: typeId,
        }) as Promise<unknown> | undefined;
        if (!dispatched) {
            window.removeEventListener(WALL_TYPE_BATCH_REPORT_EVENT, onReport);
            addMessage('assistant', 'The command bus is not ready yet — try again in a moment.');
            return;
        }
        dispatched.catch((err: unknown) => {
            window.removeEventListener(WALL_TYPE_BATCH_REPORT_EVENT, onReport);
            addMessage('assistant', `Wall type change failed: ${err instanceof Error ? err.message : String(err)}`);
        });
        resetSuggestions();
    };

    /** Live wall-type leaves, read from the catalogue at CLICK time. */
    const buildWallTypeLeafNodes = (scope: 'all' | 'selected'): SuggestionNode[] =>
        wallSystemTypeStore.getAll().map(t => ({
            label: t.name,
            hint: `${Math.round(t.totalThickness * 1000)}mm · ${t.layers.length} layer${t.layers.length === 1 ? '' : 's'}`,
            action: () => dispatchWallTypeBatch(scope, t.id),
        }));

    const makeWallTypeScopeNode = (label: string, hint: string, scope: 'all' | 'selected', prompt: string): SuggestionNode => ({
        label,
        hint,
        // `action` (not static `children`) so the type list reflects the LIVE
        // catalogue and the closures always belong to THIS panel instance.
        action: () => {
            suggestionState.stack.push({ label, nodes: buildWallTypeLeafNodes(scope), prompt });
            suggestionState.filterText = '';
            renderSuggestions();
        },
    });

    // Inject under the MODIFY pill group (the screenshot's home for these).
    // COMMAND_TREE is module-level: strip any nodes injected by a previous
    // panel instance (their closures are stale) before pushing fresh ones.
    {
        const modifyNode = COMMAND_TREE.find(n => n.label === 'Modify');
        if (modifyNode?.children) {
            const mine = new Set(['All walls → type…', 'Selected walls → type…']);
            modifyNode.children = modifyNode.children.filter(c => !mine.has(c.label));
            modifyNode.children.push(
                makeWallTypeScopeNode(
                    'All walls → type…',
                    'change every wall in the project (all levels)',
                    'all',
                    'Change ALL walls (every level) to which wall type?',
                ),
                makeWallTypeScopeNode(
                    'Selected walls → type…',
                    'change the currently selected walls',
                    'selected',
                    'Change the SELECTED walls to which wall type?',
                ),
            );
        }
    }

    const currentNodes = (): SuggestionNode[] => {
        // §DRAIN (RAC U10.3) — the registry-generated hub sits alongside the
        // hand-written QueryEngine tree, first, because it is the current truth.
        if (suggestionState.stack.length === 0) return [chatCapabilityNode(), ...COMMAND_TREE, batchCatalogueNode];
        return suggestionState.stack[suggestionState.stack.length - 1].nodes;
    };

    const nodeSearchText = (node: SuggestionNode): string => {
        return [
            node.label,
            node.hint,
            node.query,
            node.prefill,
        ].filter(Boolean).join(' ').toLowerCase();
    };

    const collectMatchingNodes = (nodes: SuggestionNode[], filter: string, matches: SuggestionNode[] = []): SuggestionNode[] => {
        for (const node of nodes) {
            if (nodeSearchText(node).includes(filter)) matches.push(node);
            if (node.children?.length) collectMatchingNodes(node.children, filter, matches);
        }
        return matches;
    };

    const resetSuggestions = (): void => {
        suggestionState = { stack: [], filterText: '' };
        if (inputEl) inputEl.value = '';
        renderSuggestions();
    };

    const renderSuggestions = (): void => {
        if (!pillsRowEl || !levelLabelEl) return;
        pillsRowEl.innerHTML = '';

        const nodes = currentNodes();
        const filter = suggestionState.filterText.trim().toLowerCase();

        // ── Determine if we're in a hub list context ────────────────────────
        const topFrame = suggestionState.stack.length > 0
            ? suggestionState.stack[suggestionState.stack.length - 1]
            : null;
        const isHubMode = topFrame?.isHubList === true;
        const promptText = topFrame?.prompt;

        // ── Breadcrumb label ────────────────────────────────────────────────
        if (suggestionState.stack.length === 0) {
            levelLabelEl.innerHTML = '<span style="color:var(--app-text-muted)">What would you like to do?</span>';
        } else {
            const crumbs = suggestionState.stack.map((s, i) =>
                i < suggestionState.stack.length - 1
                    ? `<span style="color:var(--app-text-muted);cursor:pointer" data-crumb="${i}">${escapeHtml(s.label)}</span>`
                    : `<span style="color:var(--app-text);font-weight:600">${escapeHtml(s.label)}</span>`
            ).join(' <span style="color:var(--app-text-muted);margin:0 2px">›</span> ');
            levelLabelEl.innerHTML = crumbs;

            // Allow clicking crumbs to jump back
            levelLabelEl.querySelectorAll('[data-crumb]').forEach(el => {
                (el as HTMLElement).addEventListener('click', () => {
                    const idx = parseInt((el as HTMLElement).dataset.crumb || '0');
                    suggestionState.stack = suggestionState.stack.slice(0, idx + 1);
                    suggestionState.filterText = '';
                    renderSuggestions();
                });
            });
        }

        // ── Parametric flow prompt ──────────────────────────────────────────
        if (promptText) {
            const promptCard = document.createElement('div');
            promptCard.className = 'ai-cmd-prompt';
            promptCard.textContent = promptText;
            pillsRowEl.appendChild(promptCard);
        }

        const filtered = filter
            ? collectMatchingNodes(nodes, filter).slice(0, 14)
            : nodes;

        // ── Back pill ───────────────────────────────────────────────────────
        if (suggestionState.stack.length > 0) {
            const backPill = document.createElement('button');
            backPill.type = 'button';
            backPill.className = 'ai-suggestion-pill ai-suggestion-pill--back';
            backPill.textContent = '← back';
            backPill.addEventListener('click', () => {
                suggestionState.stack.pop();
                suggestionState.filterText = '';
                renderSuggestions();
            });
            pillsRowEl.appendChild(backPill);
        }

        // ── Switch layout class for hub vs normal mode ──────────────────────
        pillsRowEl.className = isHubMode
            ? 'ai-suggestion-pills ai-suggestion-pills--hub-list'
            : 'ai-suggestion-pills';

        // ── Render each node ────────────────────────────────────────────────
        filtered.forEach(node => {
            const pill = document.createElement('button');
            pill.type = 'button';

            if (isHubMode) {
                // Hub list item — full-width row with bold label + inline hint + optional badge
                pill.className = 'ai-suggestion-pill ai-suggestion-pill--hub-item';
                pill.innerHTML = `<span class="ai-hub-label">${escapeHtml(node.label)}</span>`
                    + (node.hint ? ` <span class="ai-hub-hint">${escapeHtml(node.hint)}</span>` : '')
                    + (node.children ? `<span class="ai-hub-arrow">›</span>` : '');
            } else {
                // Normal pill — compact horizontal chip
                pill.className = 'ai-suggestion-pill';
                if (node.hint) {
                    pill.innerHTML = `${escapeHtml(node.label)} <span style="font-size:9px;color:var(--app-text-muted);font-weight:400;">${escapeHtml(node.hint)}</span>`;
                } else {
                    pill.textContent = node.label;
                }

                if (node.children && node.children.length > 0) {
                    pill.classList.add('ai-suggestion-pill--has-children');
                } else if (node.autoSend || node.query) {
                    pill.classList.add('ai-suggestion-pill--leaf');
                }

                // Scope badge on non-hub items (e.g. parametric flow scope options)
                if (node.scopeBadge) {
                    const badge = document.createElement('span');
                    badge.className = `ai-scope-badge ai-scope-badge--${node.scopeBadge.replace(' ', '-')}`;
                    badge.textContent = node.scopeBadge;
                    pill.appendChild(badge);
                }
            }

            pill.title = node.query ?? node.prefill ?? node.hint ?? '';

            pill.addEventListener('click', async () => {
                if (node.action) { node.action(); return; }   // C17 CB-8 — direct catalogue dispatch
                if (node.children && node.children.length > 0) {
                    // Drill down into children
                    suggestionState.stack.push({
                        label: node.label,
                        nodes: node.children,
                        isHubList: node.isHubList,
                        prompt: node.prompt,
                    });
                    suggestionState.filterText = '';
                    renderSuggestions();
                } else if (node.autoSend && node.query) {
                    // Auto-send this query
                    if (inputEl) inputEl.value = node.query;
                    resetSuggestions();
                    addMessage('user', node.query);
                    await _executeSend(node.query);
                } else if (node.prefill !== undefined) {
                    // Pre-fill input and let user continue
                    if (inputEl) {
                        inputEl.value = node.prefill;
                        inputEl.focus();
                        inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
                    }
                    suggestionState.stack = [];
                    suggestionState.filterText = '';
                    renderSuggestions();
                } else if (node.query) {
                    // Fill input with query (not auto-send)
                    if (inputEl) { inputEl.value = node.query; inputEl.focus(); }
                }
            });

            pillsRowEl.appendChild(pill);
        });

        // ── Empty state ─────────────────────────────────────────────────────
        if (filtered.length === 0 && nodes.length > 0) {
            const empty = document.createElement('span');
            empty.style.cssText = 'font-size:11px;color:var(--app-text-muted);padding:2px 4px;font-family:var(--app-font);';
            empty.textContent = 'No matching commands — press Enter to send as query';
            pillsRowEl.appendChild(empty);
        }
    };

    // Extracted send logic (so both handleSend and auto-send pills share it)
    const _executeSend = async (query: string): Promise<void> => {
        if (!transcriptEl) return;

        // ══ §CHAT-ATTACH (L-10906..L-10908) — the PHOTO half of "photo + sentence" ══
        //
        // Runs BEFORE the resolver, because the photograph changes what the
        // sentence MEANS: with an image, "5 storeys" is a correction of what was
        // measured; without one, "as per the image" is a request for something the
        // user has not supplied. Neither can be decided after the fact.
        let turn: ChatTurnFacts | undefined;
        const taken = await consumeChatAttachment();
        renderAttachment();

        if (taken !== null) {
            // The record of WHAT was read, on the persistent transcript. The chip
            // is gone by now — the transcript is the only place this survives.
            addMessage('assistant', describeAttachment(taken.attachment));
            if (!taken.reading.ok) {
                // ⛔ REFUSE, DO NOT QUIETLY BUILD WITHOUT IT. He attached that file
                // deliberately; a building that arrives anyway looks like the photo
                // was used. [[context-data-honesty-family]] — failure and absence
                // must not print the same value.
                addMessage(
                    'assistant',
                    `I could not read that image — ${taken.reading.reason} Nothing was created.`,
                );
                return;
            }
            turn = { photoFacade: taken.reading.brief };
        } else {
            // ── The sentence named an image and none is attached ─────────────
            //
            // ⚠ THE TRADE-OFF IS DELIBERATE AND IT IS THE CHEAP DIRECTION. A false
            // positive here costs ONE question, and the refusal carries its own
            // escape hatch ("ignore the image"). A false negative silently drops
            // half of what he asked for and hands back a plain block. The rule is
            // L2 (`readImageReference`) and requires an explicit referring
            // construction, so a bare noun in an unrelated clause does not fire.
            const ref = readImageReference(query);
            if (ref.referenced) {
                addMessage('assistant', missingImageRefusal(ref.phrase));
                return;
            }
        }

        // §ADR-0313 — zero-token resolution ladder FIRST (tier 0 grammar,
        // tier 1 synonyms/typos). Command-shaped utterances dispatch through
        // the bus with 0 tokens; refusals are honest chat replies; only a
        // MISS falls through to the LLM path below.
        try {
            const handled = await tryHandleZeroToken(query, {
                say: (text: string) => addMessage('assistant', text),
                confirm: (summary: string) => showZeroTokenConfirm(summary),
            }, turn);
            if (handled) return;
        } catch (err) {
            // Never let the zero-token path take the chat down — report and
            // fall through (§CONTEXT-DATA-HONESTY: the user sees the failure).
            console.error('[AIPanel] zero-token path failed:', err);
            addMessage('assistant', 'The quick command path hit an error — falling back to the AI.');
        }

        // ⭐ §CHAT-ATTACH — THE PHOTO WAS READ AND NOBODY USED IT. Everything below
        // this line (planner, then the LLM) is text-only: neither carries the
        // façade brief. Falling through in silence would consume his photograph and
        // answer as though he had never attached one — the [[committed-is-not-reachable]]
        // failure at the level of a single turn. Say it, and say which sentence
        // does reach the generator.
        if (turn !== undefined) {
            addMessage(
                'assistant',
                'I read that photo, but I did not understand this sentence as a request to GENERATE a ' +
                    'building, so nothing used it. The façade reading only feeds building generation — ' +
                    'try "create a residential building with the facade as per the image, 5 storeys, on ' +
                    'the current boundary line". Attach the photo again with that sentence.',
            );
            return;
        }

        // §PLANNER (RAC U10.2) — the LAST rung before the legacy path. Reached
        // only when tiers 0/1 and the NL layer all missed, so every sentence
        // the grammar understands still costs zero tokens. The planner emits
        // the SAME validated SemanticIntent structures and they run through the
        // SAME executor: same Confirm cards, same refusals, same undo cost.
        // It returns false only when no AI upstream is configured (the current
        // production state) or the relay failed — in which case the legacy
        // read-only path below still gets its turn.
        {
            const plannerTyping = document.createElement('div');
            plannerTyping.className = 'ai-chat-typing';
            plannerTyping.textContent = 'Reading that…';
            transcriptEl.appendChild(plannerTyping);
            scrollTranscript();
            let planned = false;
            try {
                planned = await tryHandleWithPlanner(query, {
                    say: (text: string) => addMessage('assistant', text),
                    confirm: (summary: string) => showZeroTokenConfirm(summary),
                });
            } catch (err) {
                console.error('[AIPanel] planner rung failed:', err);
            } finally {
                if (plannerTyping.isConnected) plannerTyping.remove();
            }
            if (planned) return;
        }

        const typingEl = document.createElement('div');
        typingEl.className = 'ai-chat-typing';
        typingEl.textContent = 'PRYZM AI is thinking…';
        transcriptEl.appendChild(typingEl);
        scrollTranscript();

        try {
            const result = await aiService.query(query);
            if (typingEl.isConnected) typingEl.remove();

            // ── Phase 3.3 — Actionable Logs ─────────────────────────────────
            // Extract referenced element IDs → "Highlight Selection" button
            const allRefs = AIResponseParser.extractElementRefs(result);
            const existingRefs = allRefs.length > 0
                ? AIResponseParser.filterExistingElements(allRefs)
                : [];

            // ── Phase 3.1 — Ghost Preview ────────────────────────────────────
            // Scan response text for JSON element proposals
            const ghostProposals = AIResponseParser.extractGhostProposal(result);
            if (ghostProposals.length > 0) {
                try {
                    getPreviewManager().showProposal(ghostProposals);
                    console.log(`[AIPanel] Ghost preview: ${ghostProposals.length} proposed element(s).`);
                } catch (pvwErr) {
                    console.warn('[AIPanel] PreviewManager.showProposal failed:', pvwErr);
                }
            }

            // §PLANNER (RAC U10.2) — when EVERY rung missed, say which one was
            // missing rather than leaving the founder with a bare "not sure".
            // The legacy QueryEngine's own miss string is the signal; a deploy
            // with no AI upstream (the current production state) is a
            // configuration fact he can act on, and hiding it makes the whole
            // chat look broken instead of unconfigured.
            if (/^I'm not sure how to help with that yet\.?$/i.test(result.answer.trim())
                && !(await plannerIsConfigured())) {
                addMessage(
                    'assistant',
                    "I'm not sure how to help with that yet. The direct commands I do understand still work "
                    + '(try "make all walls white" or "add a level"); free-phrasing needs the AI planner, and '
                    + 'this deploy has no AI upstream configured (no CF_WORKER_URL / ANTHROPIC_API_KEY).',
                );
                return;
            }

            // Add the assistant message, attaching Phase 3 metadata
            addMessage('assistant', result.answer, {
                highlightIds: existingRefs.length > 0 ? existingRefs : undefined,
                ghostProposal: ghostProposals.length > 0 ? ghostProposals : undefined,
            });

            // Show command proposal cards if any were queued by QueryEngine
            const proposals = commandProposalStore.getAll();
            if (proposals.length > 0) {
                proposals.forEach((p: CommandProposal) => addProposalCard(p));
            }
        } catch (err) {
            if (typingEl.isConnected) typingEl.remove();
            addMessage('assistant', 'Sorry, something went wrong. Please try again.');
        }
    };

    // ── Global event listeners ──────────────────────────────────────────────

    window.runtime?.events?.on('ai-model-update', () => { // F.events.12
        // Nothing to do here in the simplified chat panel
    });

    window.runtime?.events?.on('ai-proposal-added', (e: { proposal: unknown }) => { // F.events.12
        const proposal = e.proposal;
        if (proposal) {
            console.log('[AIPanel] Proposal received via event — showing inline card:', proposal);
            addProposalCard(proposal as any); // proposal is CommandProposal — typed unknown to avoid package→app dep
            // Ensure the panel is visible
            const aiPanel = document.getElementById('ai-panel-container');
            if (aiPanel && aiPanel.style.display === 'none') {
                const aiToggle = document.querySelector('[icon="material-symbols:robot-2"]') as HTMLElement;
                if (aiToggle) (aiToggle as any).click();
                else aiPanel.style.display = 'flex';
            }
        }
    });

    // §OPENED-REGION (L-880) / C83 §4.1.3 — publish the `ZeroTokenUiHooks` pair this
    // panel already implements (`addMessage` = say, `showZeroTokenConfirm` = confirm)
    // so a subsystem that notices something BETWEEN user turns can use the SAME chat
    // prompt the zero-token bridge uses, instead of a fifth offer surface being minted
    // for it. Both were closures scoped inside `createAIPanel`, handed to
    // `tryHandleZeroToken` by argument and reachable from nowhere else; this is the
    // accessor and nothing more — no new message shape, no new card, no new store.
    registerChatPromptHost({
        say: (text: string) => { addMessage('assistant', text); },
        confirm: (summary: string) => showZeroTokenConfirm(summary),
        // §PROMPT-REACHES-A-HUMAN (L-881) — `showZeroTokenConfirm` resolves a
        // FABRICATED `false` when `transcriptEl` is falsy (`:1180`; the binding at
        // :819 is declared uninitialised and assigned during DOM build below). A
        // caller must be able to find out BEFORE asking, or a question posed too
        // early comes back as "the user cancelled" when no human saw anything.
        isReady: () => !!transcriptEl,
    });

    window.addEventListener('bim-level-added', () => { /* no-op in chat panel */ });
    window.addEventListener('bim-level-removed', () => { /* no-op in chat panel */ });

    // ── Build DOM ───────────────────────────────────────────────────────────

    const panel = document.createElement('div');
    panel.className = 'ai-chat-panel';

    // Header
    const headerEl = document.createElement('div');
    headerEl.className = 'ai-chat-header';

    const headerIconEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    headerIconEl.setAttribute('viewBox', '0 0 24 24');
    headerIconEl.setAttribute('fill', 'none');
    headerIconEl.setAttribute('stroke', 'currentColor');
    headerIconEl.setAttribute('stroke-width', '1.8');
    headerIconEl.setAttribute('class', 'ai-chat-header-icon');
    headerIconEl.innerHTML = '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2.5-5 4-5 4"/><circle cx="12" cy="17.5" r=".8" fill="currentColor" stroke="none"/>';

    const headerTitleEl = document.createElement('div');
    headerTitleEl.className = 'ai-chat-header-title';
    headerTitleEl.textContent = 'AI Design Assistant';

    // Drag-handle dots — subtle six-dot grip indicator on the right side of the header
    const dragHintEl = document.createElement('div');
    dragHintEl.className = 'ai-chat-header-drag-hint';
    dragHintEl.title = 'Drag to reposition';
    dragHintEl.innerHTML = '<span></span><span></span><span></span><span></span><span></span><span></span>';

    // §BYOM (C105 §7.1) — the way in to "AI provider keys". It sits in the chat
    // header rather than in a settings screen because the thing it changes is
    // WHO ANSWERS THIS CHAT, and a control belongs beside the thing it affects.
    // ⚠ `preventDefault` + `stopPropagation`: the header is the drag handle, so
    // without them a click on this button starts a window drag instead.
    const keysBtn = document.createElement('button');
    keysBtn.type = 'button';
    keysBtn.className = 'ai-chat-header-keys';
    keysBtn.title = 'AI provider keys — use your own Claude, ChatGPT, Gemini, DeepSeek, OpenRouter or local Ollama';
    keysBtn.setAttribute('aria-label', 'AI provider keys');
    keysBtn.textContent = '⚙';
    keysBtn.style.cssText =
        'margin-left:auto;background:transparent;border:none;color:inherit;font-size:15px;' +
        'cursor:pointer;padding:2px 6px;line-height:1;opacity:.8;';
    keysBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    keysBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void import('./byom/AiProviderKeysPanel').then(m => m.openAiProviderKeysPanel());
    });

    headerEl.appendChild(headerIconEl);
    headerEl.appendChild(headerTitleEl);
    headerEl.appendChild(keysBtn);
    headerEl.appendChild(dragHintEl);
    panel.appendChild(headerEl);

    // Transcript
    transcriptEl = document.createElement('div');
    transcriptEl.className = 'ai-chat-transcript';
    renderTranscript();
    panel.appendChild(transcriptEl);

    // Suggestion area
    const suggestionsEl = document.createElement('div');
    suggestionsEl.className = 'ai-suggestions';

    levelLabelEl = document.createElement('div');
    levelLabelEl.className = 'ai-suggestion-level-label';
    levelLabelEl.textContent = 'Quick actions — click or type:';

    pillsRowEl = document.createElement('div');
    pillsRowEl.className = 'ai-suggestion-pills';

    suggestionsEl.appendChild(levelLabelEl);
    suggestionsEl.appendChild(pillsRowEl);
    panel.appendChild(suggestionsEl);

    // Initial suggestion render
    renderSuggestions();

    // §CHAT-ATTACH — the pending-photograph strip, ABOVE the input so it sits
    // between what he typed and the Send button he is about to press.
    attachRowEl = document.createElement('div');
    attachRowEl.className = 'ai-chat-attach-row';
    attachRowEl.style.display = 'none';
    panel.appendChild(attachRowEl);

    // Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'ai-chat-input-row';

    // ── §CHAT-ATTACH — ROUTE 1 of 3: the paperclip ──────────────────────────
    // A real `<input type="file">`, kept off-screen rather than `display:none`:
    // a hidden input is not focusable and some assistive tech will not reach it,
    // and the label/button pairing below is what makes the control announceable.
    const fileInputEl = document.createElement('input');
    fileInputEl.type = 'file';
    // ⭐ `image/*` PLUS the explicit HEIC/HEIF types. Several mobile browsers do
    // not match a camera-roll HEIC against the `image/*` wildcard, so the founder
    // would open the picker and find his own photographs greyed out.
    fileInputEl.accept = 'image/*,.heic,.heif,image/heic,image/heif';
    fileInputEl.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
    fileInputEl.addEventListener('change', () => {
        const f = fileInputEl.files?.[0];
        // Reset FIRST so picking the SAME file twice still fires `change` — the
        // input keeps its value otherwise and the second pick is silently ignored.
        fileInputEl.value = '';
        if (f !== undefined) void attachFile(f);
    });

    const attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.className = 'ai-chat-attach-btn';
    attachBtn.textContent = '📎';
    attachBtn.title = 'Attach a photo of a façade — "create a residential building with the facade as per the image"';
    attachBtn.setAttribute('aria-label', 'Attach a façade photo');
    attachBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInputEl.click();
    });

    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'ai-chat-input';
    inputEl.placeholder = 'Type a command or question…';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;

    // ── §CHAT-ATTACH — ROUTE 2 of 3: paste ──────────────────────────────────
    // ⭐ THE CHEAPEST ROUTE AND THE ONE HE IS MOST LIKELY TO USE. A screenshot on
    // Windows goes to the clipboard, not to a file. Without this he would have to
    // save it somewhere first just to hand it to the chat.
    inputEl.addEventListener('paste', (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (items === undefined) return;
        for (const item of Array.from(items)) {
            if (item.kind !== 'file') continue;
            const f = item.getAsFile();
            if (f === null) continue;
            // Only swallow the event once we KNOW there is a file — a plain text
            // paste must still land in the input.
            e.preventDefault();
            void attachFile(f);
            return;
        }
    });

    // Wire input to filter suggestions in real time
    inputEl.addEventListener('input', () => {
        suggestionState.filterText = inputEl.value.trim();
        renderSuggestions();
    });

    // Enter key to send
    inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
    });

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'ai-chat-send-btn';
    sendBtn.textContent = 'Send';
    sendBtn.addEventListener('click', handleSend);

    inputRow.appendChild(fileInputEl);
    inputRow.appendChild(attachBtn);
    inputRow.appendChild(inputEl);
    inputRow.appendChild(sendBtn);
    panel.appendChild(inputRow);

    // ── §CHAT-ATTACH — ROUTE 3 of 3: drag and drop onto the whole panel ─────
    //
    // ⚠ `dragover` MUST call `preventDefault()` or the browser navigates away to
    // the dropped file and the editor session is gone. That is not a styling
    // detail — it is the difference between a drop target and losing the model.
    //
    // The target is the WHOLE panel, not a small strip: a user dragging a
    // photograph aims at the conversation, not at a 24-pixel affordance he has to
    // find first.
    let dragDepth = 0;
    const setDragActive = (active: boolean): void => {
        panel.classList.toggle('ai-chat-dropzone--active', active);
    };
    panel.addEventListener('dragenter', (e: DragEvent) => {
        if (e.dataTransfer === null || !Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        // ⚠ DEPTH-COUNTED, not a boolean. `dragenter`/`dragleave` fire for every
        // CHILD element crossed, so a boolean flickers off the moment the pointer
        // moves from the transcript onto a bubble inside it — and the highlight
        // disappears while the file is still over the panel.
        dragDepth += 1;
        setDragActive(true);
    });
    panel.addEventListener('dragover', (e: DragEvent) => {
        if (e.dataTransfer === null || !Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    panel.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) setDragActive(false);
    });
    panel.addEventListener('drop', (e: DragEvent) => {
        const files = e.dataTransfer?.files;
        if (files === undefined || files.length === 0) return;
        e.preventDefault();
        dragDepth = 0;
        setDragActive(false);
        const f = files[0];
        if (f !== undefined) void attachFile(f);
        if (files.length > 1) {
            // ⛔ SAY SO. Silently taking the first of five files and building from
            // it is a wrong answer wearing a right one's clothes.
            addMessage(
                'assistant',
                `You dropped ${files.length} files — I read one façade per message, so I took ` +
                    `"${f?.name ?? 'the first'}". Send this one, then attach the next.`,
            );
        }
    });

    // Expose on window for backward compatibility — other subsystems may trigger
    // the approval modal directly (e.g. voice interface, AmbientIntelligence).
    window.__aiPanelShowApprovalModal = showApprovalModal; // TODO(F.6.5): panel-host registry bridge — destruction in F.6.5 — Phase F.6.5

    return panel;
}
