/// <reference path="./global-window.d.ts" />
/**
 * @file AIElementFactory.ts
 * @description Tool-layer service that calls the Claude Vision API and returns
 * a validated AIElementConfig wrapped in a CommandProposal.
 *
 * CONTRACT (04-BIM §3.1 / §8 Tool Layer):
 *  - NEVER mutates stores. NEVER calls builders. NEVER calls commandManager.execute().
 *  - Returns a CommandProposal → caller pushes to commandProposalStore.
 *  - Validates levelId against BimManager — FAILS EXPLICITLY, no silent fallback.
 *  - Validates config via AIElementValidator — re-prompts once, then throws.
 *  - ID is generated HERE (Tool layer) and carried into CreateAIElementCommand payload.
 */

import { apiFetch } from '@pryzm/core-app-model';
import { AIElementConfig } from '@pryzm/geometry-furniture';
import { AIElementValidator } from '@pryzm/geometry-furniture';
import { CreateAIElementCommand, CreateAIElementPayload } from '@pryzm/command-registry';
import { CommandProposal } from '@pryzm/command-registry';
import { FurnitureMaterial } from '@pryzm/geometry-furniture';
import { AIIntentType } from './intents.js';
import { EntitlementStore } from '@pryzm/core-app-model';
import { AIUsageTracker } from '@pryzm/core-app-model';
import { Feature } from '@pryzm/core-app-model';

/** Thrown when the user's monthly AI quota is exhausted. */
export class AIQuotaExceededError extends Error {
    readonly feature: Feature;
    constructor(feature: Feature = Feature.AI_ELEMENT_CREATOR) {
        super('[AIElementFactory] AI quota exceeded for current billing period.');
        this.name = 'AIQuotaExceededError';
        this.feature = feature;
    }
}

export interface AIElementGenerateRequest {
    /** Base64-encoded image data — no "data:..." prefix */
    imageBase64: string;
    /** User description prompt */
    prompt: string;
    /** Must exist in BimManager — validated before API call */
    levelId: string;
    /** Placement position in world space */
    position: { x: number; y: number; z: number };
    material?: FurnitureMaterial;
    color?: string;
}

export interface AIElementGenerateResult {
    config: AIElementConfig;
    proposal: CommandProposal;
}

// API key is handled by the internal server proxy — never exposed in the browser.

const SYSTEM_PROMPT = `You are a BIM element geometry generator for a THREE.js renderer. Output ONLY valid JSON. No markdown, no code fences, no explanation.

══════════════════════════════════════════════════════════════
STEP 1 — ANALYSE THE IMAGE FIRST
══════════════════════════════════════════════════════════════
Identify: base type, pole/leg count, shade type (globe/drum/cone/bowl), materials, proportions.

══════════════════════════════════════════════════════════════
SCHEMA
══════════════════════════════════════════════════════════════
{
  "version": "1.0",
  "elementType": "ai_<snake_case>",
  "displayName": "Name",
  "boundingBox": { "w": m, "h": m, "d": m },
  "baseOffset": 0,
  "components": [...],
  "parameters": [...],
  "metadata": { "generatedAt": "<ISO8601>", "prompt": "<prompt>", "aiModel": "claude-sonnet-4-20250514" }
}

AIComponent fields:
  id, label, shape, dimensions, position {x,y,z}, rotation {x,y,z} (DEGREES), material {color,metalness,roughness}

Shapes: box(width,height,depth) | cylinder(radiusBottom,radiusTop?,height,segments) | sphere(radius,segments) | cone(radiusBottom,height,segments) | torus(radius,tube,segments)

══════════════════════════════════════════════════════════════
CRITICAL — COMPONENT ID NAMING (the engine uses IDs for auto-placement)
══════════════════════════════════════════════════════════════
The rendering engine reads component IDs to auto-snap parts into correct positions.
YOU MUST use these exact keyword patterns:

BASE/STRUCTURE IDs must contain one of: leg, pole, base, disc, stand, stem, post, column, bar, strut
  -> These are the STRUCTURAL anchor. The shade snaps to the TOP of the tallest structural component.
  -> Examples: "base_disc", "pole_main", "leg_front_left"

SHADE/GLOBE IDs must contain one of: shade, globe, drum, bowl, diffuser, glass, orb
  -> The engine MOVES this component to sit on top of the structure automatically.
  -> You do NOT need to calculate the correct Y — engine does it. Set position.y = your best guess.
  -> Examples: "globe_shade", "shade_drum", "glass_globe", "bowl_shade"
  -> For a frosted sphere globe: use id = "globe_shade", shape = "sphere"

COLLAR/CUP IDs must contain one of: collar, cup, socket
  -> Small connector piece between pole top and globe bottom.
  -> Engine snaps to globe bottom automatically. Set position.y = 0.
  -> Example: "collar_cup", "socket_neck"

TORUS SHAPES: Only use torus if you can CLEARLY see a ring in the image.
  -> If you use a torus and its ID does NOT contain collar/cup/socket, it will be HIDDEN by the engine.
  -> DO NOT add decorative torus rings that are not visible in the image.

HIDDEN (these IDs are filtered out): cable, cord, wire, plug, switch, deco_ring, decorative

══════════════════════════════════════════════════════════════
GLOBE FLOOR LAMP — USE THIS EXACT STRUCTURE
══════════════════════════════════════════════════════════════
For a lamp with: round flat base + single vertical pole + frosted sphere globe on top:

{
  "components": [
    {
      "id": "base_disc",
      "shape": "cylinder",
      "dimensions": { "radiusBottom": 0.17, "radiusTop": 0.17, "height": 0.04, "segments": 32 },
      "position": { "x": 0, "y": 0.02, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "material": { "color": "#b5952a", "metalness": 0.8, "roughness": 0.3 }
    },
    {
      "id": "pole_main",
      "shape": "cylinder",
      "dimensions": { "radiusBottom": 0.012, "radiusTop": 0.012, "height": 1.38, "segments": 16 },
      "position": { "x": 0, "y": 0.73, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "material": { "color": "#b5952a", "metalness": 0.8, "roughness": 0.3 }
    },
    {
      "id": "collar_cup",
      "shape": "cylinder",
      "dimensions": { "radiusBottom": 0.028, "radiusTop": 0.022, "height": 0.04, "segments": 16 },
      "position": { "x": 0, "y": 0, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "material": { "color": "#b5952a", "metalness": 0.8, "roughness": 0.3 }
    },
    {
      "id": "globe_shade",
      "shape": "sphere",
      "dimensions": { "radius": 0.155, "segments": 32 },
      "position": { "x": 0, "y": 0, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "material": { "color": "#f8f6f0", "metalness": 0.0, "roughness": 0.1, "transparent": true, "opacity": 0.88 }
    }
  ]
}

Adjust dimensions and materials to match the image exactly. Add more detail components as needed.

══════════════════════════════════════════════════════════════
CROSSED-LEG FLOOR LAMP
══════════════════════════════════════════════════════════════
4 legs crossing at ~65% height (y=1.07 for 1.65m lamp), splay 20 degrees:
  leg_front_left:  pos={x:-0.05, y:1.07, z: 0.05}, rot={x: 20, y:0, z:-20}
  leg_front_right: pos={x: 0.05, y:1.07, z: 0.05}, rot={x: 20, y:0, z: 20}
  leg_back_left:   pos={x:-0.05, y:1.07, z:-0.05}, rot={x:-20, y:0, z:-20}
  leg_back_right:  pos={x: 0.05, y:1.07, z:-0.05}, rot={x:-20, y:0, z: 20}
  crossing_joint:  sphere at {x:0, y:1.07, z:0}

══════════════════════════════════════════════════════════════
Y POSITIONING — Y is UP, position.y = CENTRE of component
══════════════════════════════════════════════════════════════
Vertical cylinder from floor: position.y = height / 2
Stacked: pos_N.y = heights_below + own_height / 2
Shade/globe: engine corrects position automatically — set to best guess

══════════════════════════════════════════════════════════════
MATERIALS
══════════════════════════════════════════════════════════════
Brass satin:    { "color": "#b5952a", "metalness": 0.8, "roughness": 0.30 }
Brass polished: { "color": "#c9a84c", "metalness": 0.9, "roughness": 0.10 }
Warm oak:       { "color": "#c8874a", "metalness": 0.0, "roughness": 0.80 }
Dark walnut:    { "color": "#4a2e1a", "metalness": 0.0, "roughness": 0.85 }
Fabric cream:   { "color": "#f0ece0", "metalness": 0.0, "roughness": 1.00 }
Fabric white:   { "color": "#f5f5f0", "metalness": 0.0, "roughness": 1.00 }
Brushed steel:  { "color": "#a8a8a8", "metalness": 0.9, "roughness": 0.30 }
Chrome:         { "color": "#d4d4d4", "metalness": 1.0, "roughness": 0.05 }
Matte black:    { "color": "#1a1a1a", "metalness": 0.7, "roughness": 0.60 }
Opal glass:     { "color": "#f8f6f0", "metalness": 0.0, "roughness": 0.10, "transparent": true, "opacity": 0.88 }
Frosted glass:  { "color": "#f0f0f0", "metalness": 0.0, "roughness": 0.05, "transparent": true, "opacity": 0.92 }
Marble white:   { "color": "#f0ece4", "metalness": 0.0, "roughness": 0.40 }

══════════════════════════════════════════════════════════════
SIZE REFERENCE
══════════════════════════════════════════════════════════════
Globe floor lamp:  h=1.55-1.70m, globe_r=0.13-0.18m, pole_r=0.010-0.014m, base_r=0.15-0.20m
Drum floor lamp:   h=1.55-1.70m, shade_r=0.20-0.28m
Crossed-leg lamp:  h=1.55-1.70m, shade_r=0.20-0.28m, leg_r=0.018-0.025m
Dining chair:      h=0.85m, seat_h=0.45m, w=0.50m, d=0.52m
Dining table:      h=0.75m, w=1.60m, d=0.90m
Sofa 2-seat:       h=0.85m, w=1.80m, d=0.85m

══════════════════════════════════════════════════════════════
CHECKLIST before outputting
══════════════════════════════════════════════════════════════
[ ] Globe/shade ID contains: globe, shade, drum, glass, or bowl
[ ] Pole/base ID contains: pole, base, disc, leg, or column
[ ] No torus rings invented that are not visible in image
[ ] rotation in DEGREES not radians
[ ] At least 4 parameters with 2 color pickers
[ ] boundingBox matches geometry

Generate JSON now.`.trim();

export class AIElementFactory {

    /**
     * Generates a validated AIElementConfig from an image + prompt,
     * and wraps it in a CommandProposal ready for commandProposalStore.
     */
    static async generate(req: AIElementGenerateRequest): Promise<AIElementGenerateResult> {
        // 0. Monetization gate — check AI quota before any API call
        if (!EntitlementStore.canUseAI()) {
            window.dispatchEvent(new CustomEvent('pryzm-upgrade-required', { // TODO(TASK-12)
                detail: { feature: Feature.AI_ELEMENT_CREATOR },
            }));
            throw new AIQuotaExceededError(Feature.AI_ELEMENT_CREATOR);
        }

        // 1. Validate levelId — FAIL EXPLICITLY (04-BIM §7.2)
        const bimManager = window.bimManager;
        if (!bimManager) throw new Error('[AIElementFactory] bimManager not on window');

        const level = bimManager.getLevelById(req.levelId);
        if (!level) {
            throw new Error(
                `[AIElementFactory] Level "${req.levelId}" not found in BimManager. ` +
                'Cannot generate element without a valid target level.'
            );
        }

        // 2. Call Claude Vision API (with one re-prompt on validation failure)
        const config = await AIElementFactory.fetchWithRetry(req);

        // 3. Generate ID in Tool layer — never inside command execute()
        const elementId = crypto.randomUUID();
        const baseOffset = config.baseOffset ?? 0;

        const payload: CreateAIElementPayload = {
            id: elementId,
            levelId: req.levelId,
            baseOffset,
            position: req.position,
            rotation: { x: 0, y: 0, z: 0 },
            material: req.material ?? 'wood',
            ...(req.color !== undefined ? { color: req.color } : {}),
            aiElementConfig: config,
        };

        const command = new CreateAIElementCommand(payload);

        // Pre-validate against live context for proposal status
        const commandContext = window.commandContext;
        const validation = commandContext
            ? command.canExecute(commandContext)
            : { ok: true as const };

        const proposal: CommandProposal = {
            id: crypto.randomUUID(),
            intentType: AIIntentType.CREATE_AI_ELEMENT,
            command,
            validation,
            rationale: `AI generated "${config.displayName}" from photo and prompt: "${req.prompt}"`,
            confidence: 0.85,
        };

        // Track AI usage after successful generation
        try {
            const userId = (() => {
                try { return JSON.parse(localStorage.getItem('bim-platform-user') || '{}').id || 'anonymous'; } catch { return 'anonymous'; }
            })();
            AIUsageTracker.increment(userId);
            console.log(`[AIElementFactory] AI usage tracked. Remaining: ${EntitlementStore.getAIActionsRemaining()}`);
        } catch { /* tracking must never block */ }

        return { config, proposal };
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private static async fetchWithRetry(req: AIElementGenerateRequest): Promise<AIElementConfig> {
        const rawFirst = AIElementFactory.sanitize(await AIElementFactory.callClaudeAPI(req, null));
        const firstResult = AIElementValidator.validate(rawFirst);

        if (firstResult.ok) return rawFirst as AIElementConfig;

        // Re-prompt once with the validation error list
        const errorSummary = firstResult.errors
            .map(e => `${e.field}: ${e.message}`)
            .join('\n');
        console.warn('[AIElementFactory] First response invalid, re-prompting:\n', errorSummary);

        const rawSecond = AIElementFactory.sanitize(await AIElementFactory.callClaudeAPI(req, errorSummary));
        const secondResult = AIElementValidator.validate(rawSecond);

        if (!secondResult.ok) {
            const finalErrors = secondResult.errors.map(e => `${e.field}: ${e.message}`).join('; ');
            throw new Error(`[AIElementFactory] Config invalid after re-prompt: ${finalErrors}`);
        }

        return rawSecond as AIElementConfig;
    }

    /**
     * Sanitizes a raw Claude JSON response to fix common mistakes before validation.
     * Does NOT invent geometry — only fills in trivially derivable missing fields.
     */
    private static sanitize(raw: unknown): unknown {
        if (typeof raw !== 'object' || raw === null) return raw;
        const c = raw as Record<string, unknown>;

        // Ensure version
        if (!c['version']) c['version'] = '1.0';

        // Ensure metadata with generatedAt
        if (typeof c['metadata'] !== 'object' || c['metadata'] === null) {
            c['metadata'] = { generatedAt: new Date().toISOString() };
        } else {
            const m = c['metadata'] as Record<string, unknown>;
            if (!m['generatedAt'] || typeof m['generatedAt'] !== 'string') {
                m['generatedAt'] = new Date().toISOString();
            }
        }

        // Sanitize components
        if (Array.isArray(c['components'])) {
            c['components'] = (c['components'] as Record<string, unknown>[]).map((comp, idx) => {
                // Ensure component id
                if (!comp['id'] || typeof comp['id'] !== 'string') {
                    comp['id'] = `component_${idx}`;
                }

                // Fix cylinder/cone dimensions: Claude often uses "radius" instead of "radiusBottom"
                if ((comp['shape'] === 'cylinder' || comp['shape'] === 'cone') &&
                    typeof comp['dimensions'] === 'object' && comp['dimensions'] !== null) {
                    const dims = comp['dimensions'] as Record<string, unknown>;
                    if (dims['radius'] !== undefined && dims['radiusBottom'] === undefined) {
                        dims['radiusBottom'] = dims['radius'];
                    }
                    if (dims['radiusTop'] === undefined) {
                        dims['radiusTop'] = comp['shape'] === 'cone' ? 0 : dims['radiusBottom'];
                    }
                }

                // Fix torus orientation — Three.js torus lies in XZ by default (axis Y)
                // Lampshade rings should lie in XY → rotate 90° around X
                if (comp['shape'] === 'torus') {
                    const rot = (comp['rotation'] ?? {}) as Record<string, number>;
                    if (rot['x'] === undefined) rot['x'] = 90;
                    comp['rotation'] = rot;
                }

                // Attach foot spheres to legs
                if (comp['shape'] === 'sphere' && typeof comp['id'] === 'string' && (comp['id'] as string).includes('foot')) {
                    const legs = (c['components'] as Record<string, unknown>[])
                        .filter(l => typeof l['id'] === 'string' && (l['id'] as string).includes('leg'));

                    const match = legs.find(l => (comp['id'] as string).includes((l['id'] as string).split('_')[1]!));

                    if (match) {
                        const legDims = match['dimensions'] as Record<string, number>;
                        const legPos = match['position'] as Record<string, number>;

                        if (legDims?.height && legPos?.y !== undefined) {
                            comp['position'] = {
                                ...(comp['position'] as Record<string, number>),
                                y: legPos.y - legDims.height / 2
                            };
                        }
                    }
                }

                // Ensure cables have proper tag
                if (typeof comp['id'] === 'string' && comp['id'].includes('cord')) {
                    comp['tags'] = [...new Set([...(comp['tags'] as string[] ?? []), 'cable'])];
                }

                return comp;
            });
        }

        // Sanitize parameters
        if (Array.isArray(c['parameters'])) {
            c['parameters'] = (c['parameters'] as Record<string, unknown>[]).map((param, idx) => {
                if (!param['id'] || typeof param['id'] !== 'string') {
                    param['id'] = `param_${idx}`;
                }
                if (!param['label'] || typeof param['label'] !== 'string') {
                    param['label'] = param['id'] as string;
                }
                if (param['default'] === undefined) {
                    // Derive a sensible default from min/max or type
                    if (param['type'] === 'boolean') param['default'] = false;
                    else if (param['type'] === 'color') param['default'] = '#ffffff';
                    else param['default'] = param['min'] ?? 0;
                }
                return param;
            });
        }

        return c;
    }

    private static async callClaudeAPI(
        req: AIElementGenerateRequest,
        previousErrors: string | null
    ): Promise<unknown> {
        const userText = previousErrors
            ? `The user wants: "${req.prompt}"\n\nYour previous JSON had these errors:\n${previousErrors}\n\nFix all errors and return ONLY the corrected JSON object.`
            : `Generate a 3D element config for: "${req.prompt}"\n\nReturn ONLY the JSON object.`;

        // Strip "data:image/...;base64," prefix if present — Anthropic wants raw base64 only
        const rawBase64 = req.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

        // Detect media type from data URL prefix, or sniff from raw base64 magic bytes
        let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
        if (req.imageBase64.startsWith('data:image/png')) {
            mediaType = 'image/png';
        } else if (req.imageBase64.startsWith('data:image/gif')) {
            mediaType = 'image/gif';
        } else if (req.imageBase64.startsWith('data:image/webp')) {
            mediaType = 'image/webp';
        } else if (req.imageBase64.startsWith('data:image/jpeg') || req.imageBase64.startsWith('data:image/jpg')) {
            mediaType = 'image/jpeg';
        } else {
            // No data URL prefix — sniff from base64 magic bytes
            if (rawBase64.startsWith('iVBORw0KGgo')) mediaType = 'image/png';       // PNG magic
            else if (rawBase64.startsWith('R0lGOD')) mediaType = 'image/gif';        // GIF magic
            else if (rawBase64.startsWith('UklGR')) mediaType = 'image/webp';        // WebP magic
            else mediaType = 'image/jpeg';                                            // default JPEG
        }

        const response = await apiFetch('/api/anthropic/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4000,
                system: SYSTEM_PROMPT,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType,
                                data: rawBase64,
                            },
                        },
                        { type: 'text', text: userText },
                    ],
                }],
            }),
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            console.error('[AIElementFactory] Anthropic error body:', JSON.stringify(errBody));
            throw new Error(`[AIElementFactory] API error: ${response.status} ${JSON.stringify(errBody)}`);
        }

        const data = await response.json();
        const text: string = (data.content ?? [])
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text: string }) => b.text)
            .join('');

        // Strip any accidental markdown fences
        const cleaned = text.replace(/```json|```/g, '').trim();

        try {
            return JSON.parse(cleaned);
        } catch {
            throw new Error(`[AIElementFactory] Non-JSON response: ${cleaned.slice(0, 200)}`);
        }
    }
}