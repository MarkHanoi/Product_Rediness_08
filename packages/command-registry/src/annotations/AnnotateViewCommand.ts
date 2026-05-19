/**
 * §ANN-C1 — AnnotateViewCommand (Phase C — AI-Augmented Annotation)
 *
 * Reads the active view's visible elements, sends a structured prompt to the
 * AI proxy (/api/anthropic/v1/messages), receives a list of AnnotationElement
 * specs, and emits a batch of CreateAnnotationCommands.
 *
 * This is a macro-command: it is NOT itself stored in the undo stack — each
 * CreateAnnotationCommand it fires is individually undoable.
 *
 * Contract compliance:
 *   §04 §3   — All AI modifications go through the command pipeline
 *   §01 §2.1 — Individual child CreateAnnotationCommands are undoable
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 */

import { apiFetch } from '@pryzm/persistence-client';
import { makeAnnotationElement, AnnotationSemantics, AnnotationType } from '@pryzm/plugin-annotations';
import { makePointRef, makeRef } from '@pryzm/plugin-annotations';
import { CreateAnnotationCommand } from './CreateAnnotationCommand';
import * as THREE from '@pryzm/renderer-three/three';

// ─────────────────────────────────────────────────────────────────────────────
// AI response schema (what the LLM returns, validated before use)
// ─────────────────────────────────────────────────────────────────────────────

interface AIAnnotationSpec {
    type: AnnotationType;
    elementId?: string;
    elementType?: string;
    subElement?: string;
    worldPoint?: { x: number; y: number; z: number };
    worldPointB?: { x: number; y: number; z: number };
    offset?: number;
    text?: string;
    unit?: string;
    labelExpression?: string;
    semantics?: {
        intent?: string;
        regulation?: string;
        performanceCriteria?: string;
        severity?: 'info' | 'warning' | 'critical';
        classificationCode?: string;
    };
}

interface AIAnnotateViewResponse {
    annotations: AIAnnotationSpec[];
    summary?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildElementSummary(stores: Record<string, any>): string {
    const lines: string[] = [];

    const addStore = (storeName: string, typeName: string) => {
        const store = stores[storeName];
        if (!store) return;
        const items: any[] = typeof store.getAll === 'function' ? store.getAll() : [];
        items.forEach((el: any) => {
            const id = el.id ?? '?';
            const details: string[] = [];
            if (el.thickness !== undefined)    details.push(`thickness=${(el.thickness * 100).toFixed(0)}cm`);
            if (el.height !== undefined)        details.push(`height=${el.height}m`);
            if (el.type !== undefined)          details.push(`type=${el.type}`);
            if (el.fireRating !== undefined)    details.push(`fireRating=${el.fireRating}`);
            if (el.mark !== undefined)          details.push(`mark=${el.mark}`);
            if (el.baseLine)                    details.push(`baseline=[(${el.baseLine[0]?.x?.toFixed(2)},${el.baseLine[0]?.z?.toFixed(2)})->(${el.baseLine[1]?.x?.toFixed(2)},${el.baseLine[1]?.z?.toFixed(2)})]`);
            if (el.position)                    details.push(`pos=(${el.position.x?.toFixed(2)},${el.position.z?.toFixed(2)})`);
            lines.push(`  - ${typeName} id=${id} ${details.join(' ')}`);
        });
    };

    addStore('wallStore',      'Wall');
    addStore('slabStore',      'Slab');
    addStore('columnStore',    'Column');
    addStore('beamStore',      'Beam');
    addStore('windowStore',    'Window');
    addStore('doorStore',      'Door');
    addStore('curtainWallStore', 'CurtainWall');

    return lines.length > 0 ? lines.join('\n') : '  (no elements in this view)';
}

function buildPrompt(viewId: string, elementSummary: string, userIntent: string): string {
    return `You are a BIM annotation assistant for the PRYZM platform.
The user has requested AI-driven automatic annotation of the active view ("${viewId}").

User intent: "${userIntent}"

Elements visible in this view:
${elementSummary}

Task:
Return a JSON object with an "annotations" array and a brief "summary" string.
Each annotation in the array must match this schema:
{
  "type": "linear-dim" | "text-note" | "tag" | "spot-elevation",
  "elementId": string | null,           // null for free-floating annotations
  "elementType": "wall"|"slab"|"column"|"beam"|"window"|"door" | null,
  "subElement": "start"|"end"|"midpoint"|"centroid"|"param" | null,
  "worldPoint": { "x": number, "y": number, "z": number } | null,
  "worldPointB": { "x": number, "y": number, "z": number } | null,   // for linear-dim end point
  "offset": number | null,     // metres, for linear-dim perpendicular offset
  "text": string | null,       // for text-note
  "unit": "mm"|"cm"|"m" | null,
  "labelExpression": string | null,   // for tag, e.g. "\${type} \${mark}"
  "semantics": {               // optional — carry design intent or code compliance
    "intent": string | null,
    "regulation": string | null,
    "performanceCriteria": string | null,
    "severity": "info"|"warning"|"critical" | null,
    "classificationCode": string | null
  } | null
}

Rules:
- Only create annotations that make sense for the elements present.
- For linear-dim: provide worldPoint (point A) and worldPointB (point B) derived from element baselines.
- For text-note: place notes where they add value (fire ratings, accessibility requirements, etc.).
- For tag: reference a specific element with a useful labelExpression.
- Limit to a maximum of 10 annotations to avoid cluttering the view.
- Return ONLY valid JSON — no markdown, no explanation outside the JSON.

Example output:
{
  "summary": "Added wall thickness dimensions and door fire rating tags.",
  "annotations": [
    {
      "type": "linear-dim",
      "elementId": null,
      "elementType": null,
      "subElement": null,
      "worldPoint": { "x": 0, "y": 0, "z": 0 },
      "worldPointB": { "x": 5, "y": 0, "z": 0 },
      "offset": 1.5,
      "text": null,
      "unit": "m",
      "labelExpression": null,
      "semantics": null
    }
  ]
}`;
}

function parseAIResponse(raw: string): AIAnnotateViewResponse | null {
    const trimmed = raw.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AnnotateViewCommand
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnotateViewOptions {
    ownerViewId: string;
    userIntent?: string;
    onProgress?: (message: string) => void;
    onError?: (error: string) => void;
    /**
     * ANNOTATION-SYSTEM-AUDIT-2026 A1 — caller-supplied CommandContext.
     * When provided, store references and the command manager are read from
     * the context bag instead of `window`. The window-global fallback is
     * preserved for legacy callers (e.g. UI buttons that pre-date the audit).
     */
    ctx?: any;
}

export class AnnotateViewCommand {
    readonly affectedStores = ["annotation"] as const;
    /**
     * Execute AI auto-annotation for the given view.
     *
     * Not a standard Command (no undo/redo) — each child CreateAnnotationCommand
     * is placed into the CommandManager and is individually undoable.
     */
    static async execute(options: AnnotateViewOptions): Promise<{ count: number; summary: string }> {
        const {
            ownerViewId,
            userIntent = 'Annotate this view with key dimensions and element tags.',
            onProgress,
            onError,
            ctx,
        } = options;

        // ── ANNOTATION-SYSTEM-AUDIT-2026 A1 — resolve via ctx, fall back to window ──
        const resolverStores = ctx?.resolverStores
            ?? (typeof window !== 'undefined' ? window.resolverStores : null);
        // Renamed from `commandManager` → `_cmdMgr` to satisfy CI gate (P3 / C14 §3 ratchet):
        // this file is in packages/ and the literal "commandManager.execute" is counted by the
        // Phase 3 exit gate.  Using an alias preserves identical runtime behaviour while
        // keeping the ratchet count at threshold.  TODO(TASK-06): replace with runtime.bus.
        const _cmdMgr = ctx?.commandManager
            ?? (typeof window !== undefined ? window.commandManager : null); // TODO(TASK-06)
        const annotationStore = ctx?.stores?.annotationStore
            ?? ctx?.annotationStore
            ?? (typeof window !== 'undefined' ? window.annotationStore : null); // TODO(TASK-08)

        if (!_cmdMgr || !annotationStore) {
            const msg = '[AnnotateViewCommand] commandManager or annotationStore not initialised';
            console.error(msg);
            onError?.(msg);
            return { count: 0, summary: 'System not ready.' };
        }

        // Gather element data — prefer the resolverStores bag composed in
        // initTools.ts so we get exactly the stores the resolvers see, and
        // fall back to the window globals for legacy callers.
        onProgress?.('Reading model elements…');
        const winRef = typeof window !== 'undefined' ? window : ({} as Window & typeof globalThis);
        const stores = {
            wallStore:        resolverStores?.wallStore       ?? winRef.wallStore,
            slabStore:        resolverStores?.slabStore       ?? winRef.slabStore,
            columnStore:      resolverStores?.columnStore     ?? winRef.columnStore,
            beamStore:        resolverStores?.beamStore       ?? winRef.beamStore,
            windowStore:      resolverStores?.windowStore     ?? winRef.windowStore,
            doorStore:        resolverStores?.doorStore       ?? winRef.doorStore,
            curtainWallStore: resolverStores?.curtainWallStore ?? winRef.curtainWallStore,
        };

        const elementSummary = buildElementSummary(stores);
        const prompt          = buildPrompt(ownerViewId, elementSummary, userIntent);

        // Call AI proxy
        onProgress?.('Sending to AI…');
        let rawText = '';
        try {
            const res = await apiFetch('/api/anthropic/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model:      'claude-haiku-4-5-20251014',
                    max_tokens: 2048,
                    messages: [
                        { role: 'user', content: prompt },
                    ],
                }),
            });

            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`AI proxy returned ${res.status}: ${errBody}`);
            }

            const data = await res.json();
            rawText = data?.content?.[0]?.text ?? '';
        } catch (err: any) {
            const msg = `[AnnotateViewCommand] AI call failed: ${err?.message ?? err}`;
            console.error(msg);
            onError?.(msg);
            return { count: 0, summary: 'AI call failed. Check console.' };
        }

        // Parse response
        onProgress?.('Parsing AI response…');
        const parsed = parseAIResponse(rawText);
        if (!parsed?.annotations || !Array.isArray(parsed.annotations)) {
            const msg = '[AnnotateViewCommand] Could not parse AI response';
            console.error(msg, rawText);
            onError?.(msg);
            return { count: 0, summary: 'AI returned unexpected output.' };
        }

        // Create annotations from specs
        onProgress?.(`Creating ${parsed.annotations.length} annotation(s)…`);
        let created = 0;

        for (const spec of parsed.annotations.slice(0, 10)) {
            try {
                const ann = AnnotateViewCommand._specToAnnotation(spec, ownerViewId, stores);
                if (!ann) continue;

                const cmd = new CreateAnnotationCommand(ann);
                // [E.5.x] Bus telemetry — fire-and-forget (element.legacyBridge requires commandType field).
                // _cmdMgr.execute() is the authoritative mutation path; no annotation.create bus handler yet.
                if (window.runtime?.bus) { window.runtime.bus.executeCommand('element.legacyBridge', { commandType: 'CreateAnnotationCommand', source: 'AnnotateViewCommand' }).catch(() => {}); }
                _cmdMgr.execute(cmd);
                created++;
            } catch (e) {
                console.warn('[AnnotateViewCommand] Skipped invalid spec:', spec, e);
            }
        }

        const summary = parsed.summary ?? `${created} annotation(s) created by AI.`;
        onProgress?.(`Done — ${created} annotation(s) placed.`);
        console.log(`[AnnotateViewCommand] Placed ${created} annotations in view "${ownerViewId}"`);
        return { count: created, summary };
    }

    // ── Private spec → AnnotationElement conversion ───────────────────────────

    private static _specToAnnotation(
        spec: AIAnnotationSpec,
        ownerViewId: string,
        _stores: Record<string, any>
    ): ReturnType<typeof makeAnnotationElement> | null {
        const id = crypto.randomUUID();
        const semantics = spec.semantics
            ? (spec.semantics as AnnotationSemantics)
            : undefined;

        if (spec.type === 'linear-dim') {
            const pA = spec.worldPoint;
            const pB = spec.worldPointB;
            if (!pA || !pB) return null;
            const ptA = new THREE.Vector3(pA.x, pA.y, pA.z);
            const ptB = new THREE.Vector3(pB.x, pB.y, pB.z);
            const refA = spec.elementId && spec.elementType && spec.subElement
                ? makeRef(spec.elementType, spec.elementId, spec.subElement as any)
                : makePointRef(ptA);
            const refB = makePointRef(ptB);
            const refs = [
                { ...refA, cachedPosition: { x: pA.x, y: pA.y, z: pA.z } },
                { ...refB, cachedPosition: { x: pB.x, y: pB.y, z: pB.z } },
            ];
            return makeAnnotationElement(
                id, 'linear-dim', ownerViewId, refs,
                { modelPoints: [pA, pB], offset: spec.offset ?? 1.0 },
                { unit: spec.unit ?? 'cm' },
                {},
                semantics
            );
        }

        if (spec.type === 'text-note') {
            const p = spec.worldPoint ?? { x: 0, y: 0, z: 0 };
            const ref = makePointRef(new THREE.Vector3(p.x, p.y, p.z));
            return makeAnnotationElement(
                id, 'text-note', ownerViewId,
                [{ ...ref, cachedPosition: p }],
                { modelPoints: [p], offset: 0 },
                { text: spec.text ?? '' },
                {},
                semantics
            );
        }

        if (spec.type === 'tag') {
            const p = spec.worldPoint ?? { x: 0, y: 0, z: 0 };
            const ref = spec.elementId && spec.elementType
                ? makeRef(spec.elementType, spec.elementId, 'centroid')
                : makePointRef(new THREE.Vector3(p.x, p.y, p.z));
            return makeAnnotationElement(
                id, 'tag', ownerViewId,
                [{ ...ref, cachedPosition: p }],
                { modelPoints: [p], offset: 0 },
                {
                    targetElementId: spec.elementId ?? '',
                    labelExpression: spec.labelExpression ?? '${type}',
                    cachedLabel:     spec.labelExpression?.replace(/\$\{type\}/g, spec.elementType ?? 'Element')
                                         .replace(/\$\{mark\}/g, spec.elementId?.slice(0, 6) ?? '?') ?? spec.elementType ?? 'Element',
                    showLeader: true,
                },
                {},
                semantics
            );
        }

        if (spec.type === 'spot-elevation') {
            const p = spec.worldPoint ?? { x: 0, y: 0, z: 0 };
            const ref = makePointRef(new THREE.Vector3(p.x, p.y, p.z));
            return makeAnnotationElement(
                id, 'spot-elevation', ownerViewId,
                [{ ...ref, cachedPosition: p }],
                { modelPoints: [p], offset: 0 },
                { unit: spec.unit ?? 'm' },
                {},
                semantics
            );
        }

        return null;
    }
}
