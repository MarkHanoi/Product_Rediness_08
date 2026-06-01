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
import { aiService } from '@pryzm/ai-host';
import { commandProposalStore } from '@pryzm/command-registry';
import { CommandProposal, CommandType } from '@pryzm/command-registry';
import { aiApprovalStore } from '@pryzm/ai-host';
import { AIResponseParser } from '@pryzm/ai-host';
import { getPreviewManager } from '@app/engine/preview/PreviewManager';
import type { ElementSchema } from '@app/engine/preview/PreviewManager';
// C17 CB-8 — the AI panel surfaces the SAME batch catalogue as the CREATE panel,
// dispatched through the SAME path (dispatchBatchEntry → Path-A commandManager.execute).
import { groupCatalogue, dispatchBatchEntry, type BatchDeps } from '../create/batchCatalogue';
// SPEC-SEMANTIC §3.1 / Phase 2 — surface the existing room auto-organise (tag-by-type) flow.
import { openAutoOrganiseModal } from '../property-inspector/RoomAutoOrganiser';
// #51 (SPEC-APARTMENT-LAYOUT-GENERATOR §11/§12) — the AI apartment-layout flow.
// Single shared trigger (also exposed as the console command
// pryzmGenerateApartmentLayout()), so the leaf + console behave identically.
import { triggerApartmentLayout } from '../apartment-layout/apartmentLayoutTrigger';
import { triggerFurnishLayout } from '../furnish-layout/furnishLayoutTrigger';
import { triggerLightingLayout } from '../lighting-layout/lightingLayoutTrigger';
import { triggerCeilingLayout } from '../ceiling-layout/ceilingLayoutTrigger';
// Dev-only test modals — surface the Family Platform pipeline + apartment
// validator framework as AI Panel pills (no DevTools required). The
// underlying functions are the SAME ones exposed as __pryzmFamilyPipeline /
// __pryzmValidateLayout in apps/editor/src/dev/installPryzmTestFunctions.ts.
import { openFamilyPlatformTestModal } from '../dev/familyPlatformTestModal';
import { openValidateLayoutTestModal } from '../dev/validateLayoutTestModal';
// C27 INS-α-5 — dev surface for the Master Tree (single tree component
// per C27 §1.2).  Opens a modal that mounts the live ModelTreeComponent +
// shows the InspectSelection payload on each click.
import { openModelTreeTestModal } from '../dev/modelTreeTestModal';

// ─── Command-Aware Suggestion Tree ───────────────────────────────────────────
//
// Each node maps to a real QueryEngine natural language pattern.
// Leaf nodes either auto-send a query or pre-fill the input.

interface SuggestionNode {
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

// Full command tree — sourced from actual QueryEngine patterns
const COMMAND_TREE: SuggestionNode[] = [
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
                        openAutoOrganiseModal(lid);
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
                hint: 'auto-place furniture per occupancy archetype',
                action: () => { triggerFurnishLayout(); },
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
        ],
    },
];

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
            errEl.textContent = proposal.validation.reason || 'Validation failed — cannot approve';
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
                    validationSummary: proposal.validation.ok ? 'VALID' : (proposal.validation.reason || 'FAILED'),
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
            return svc?.facadesByOrientation?.(levelId, orientation, 0)?.map(f => f.wallId) ?? [];
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
                                const r = dispatchBatchEntry(e, batchDeps);
                                addMessage('assistant', r.ok ? `Done — ${e.label}.` : `Couldn't run "${e.label}": ${r.reason ?? 'failed'}`);
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

    const currentNodes = (): SuggestionNode[] => {
        if (suggestionState.stack.length === 0) return [...COMMAND_TREE, batchCatalogueNode];
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

    headerEl.appendChild(headerIconEl);
    headerEl.appendChild(headerTitleEl);
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

    // Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'ai-chat-input-row';

    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'ai-chat-input';
    inputEl.placeholder = 'Type a command or question…';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;

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

    inputRow.appendChild(inputEl);
    inputRow.appendChild(sendBtn);
    panel.appendChild(inputRow);

    // Expose on window for backward compatibility — other subsystems may trigger
    // the approval modal directly (e.g. voice interface, AmbientIntelligence).
    window.__aiPanelShowApprovalModal = showApprovalModal; // TODO(F.6.5): panel-host registry bridge — destruction in F.6.5 — Phase F.6.5

    return panel;
}
