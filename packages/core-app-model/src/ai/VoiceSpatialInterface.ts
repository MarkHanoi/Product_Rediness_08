/**
 * VoiceSpatialInterface — Phase K-1
 *
 * Phase:   K-1 (World Model Plan V3 — Zero-Friction Interface)
 * Contract: docs/00_PRZYM/PRYZM_World_Model_Plan_V3_Complete.md §K-1
 *
 * Pipeline:
 *   Browser Web Speech API (or text fallback)
 *   → transcribed text
 *   → POST /api/ai/voice/parse  { command, context, selection }
 *   → Claude: { intent, targets, parameters, confirmationText }
 *   → VoiceCommandIndicator shows confirmation modal
 *   → User confirms → CommandManager.execute(...)
 *
 * Safety contract (non-negotiable):
 *   - NEVER executes without explicit user confirmation
 *   - Destructive commands (delete, merge) require the user to type "CONFIRM"
 *   - If spatial references are ambiguous Claude returns a clarification question
 *   - All executed commands go through commandManager.execute() and are undoable
 *
 * Supported intent types (MVP):
 *   set-property    — set targetArea / occupancyType / name on a room set
 *   assign-template — assign a named template to a room set
 *   spatial-query   — returns matching room ids (navigation only, no mutation)
 *   navigate-to     — navigate 3D camera to a room / element
 *   clarify         — Claude asks for more information (no execution)
 */

export type VoiceIntentType =
    | 'set-property'
    | 'assign-template'
    | 'spatial-query'
    | 'navigate-to'
    | 'clarify';

export interface VoiceParsedCommand {
    intent:           VoiceIntentType;
    targets:          string[];            // resolved element IDs
    parameters:       Record<string, unknown>;
    confirmationText: string;              // human-readable preview string
    clarification?:   string;             // set when intent==='clarify'
}

export type VoiceListenState = 'idle' | 'listening' | 'processing' | 'confirming' | 'error';

export type VoiceStateListener = (state: VoiceListenState, parsed?: VoiceParsedCommand) => void;

const PARSE_ENDPOINT = '/api/ai/voice/parse';

class VoiceSpatialInterfaceImpl {
    private _recognition: any = null;
    private _state: VoiceListenState = 'idle';
    private _listeners: Set<VoiceStateListener> = new Set();
    private _lastParsed: VoiceParsedCommand | null = null;
    private _hasSpeechAPI: boolean = false;

    constructor() {
        try {
            const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
            if (SR) {
                this._recognition = new SR();
                this._recognition.continuous = false;
                this._recognition.interimResults = false;
                this._recognition.lang = 'en-GB';
                this._hasSpeechAPI = true;
                this._wireRecognition();
            }
        } catch {
            this._hasSpeechAPI = false;
        }
    }

    get state(): VoiceListenState { return this._state; }
    get hasSpeechAPI(): boolean { return this._hasSpeechAPI; }
    get lastParsed(): VoiceParsedCommand | null { return this._lastParsed; }

    subscribe(fn: VoiceStateListener): () => void {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    private _emit(state: VoiceListenState, parsed?: VoiceParsedCommand): void {
        this._state = state;
        this._listeners.forEach(fn => fn(state, parsed));
    }

    private _wireRecognition(): void {
        if (!this._recognition) return;

        this._recognition.onresult = (e: any) => {
            const text = e.results[0]?.[0]?.transcript ?? '';
            console.log('[VoiceSpatialInterface] Transcript:', text);
            if (text.trim()) {
                this._parseAndEmit(text.trim());
            } else {
                this._emit('idle');
            }
        };

        this._recognition.onerror = (e: any) => {
            console.warn('[VoiceSpatialInterface] SpeechRecognition error:', e.error);
            this._emit('error');
            setTimeout(() => this._emit('idle'), 2000);
        };

        this._recognition.onend = () => {
            if (this._state === 'listening') {
                this._emit('idle');
            }
        };
    }

    /** Start microphone listening (requires user gesture). */
    startListening(): void {
        if (this._state !== 'idle') return;
        if (!this._recognition) {
            console.warn('[VoiceSpatialInterface] Web Speech API not available');
            this._emit('error');
            setTimeout(() => this._emit('idle'), 2000);
            return;
        }
        this._emit('listening');
        try {
            this._recognition.start();
        } catch (e) {
            console.warn('[VoiceSpatialInterface] Recognition start error:', e);
            this._emit('idle');
        }
    }

    stopListening(): void {
        this._recognition?.stop();
        if (this._state === 'listening') this._emit('idle');
    }

    /** Parse a raw text command (used by text-input fallback). */
    async parseText(text: string): Promise<void> {
        if (!text.trim()) return;
        await this._parseAndEmit(text.trim());
    }

    private async _parseAndEmit(rawText: string): Promise<void> {
        this._emit('processing');
        try {
            const parsed = await this._callServer(rawText);
            this._lastParsed = parsed;
            this._emit('confirming', parsed);
        } catch (err) {
            console.error('[VoiceSpatialInterface] parse error:', err);
            this._emit('error');
            setTimeout(() => this._emit('idle'), 2500);
        }
    }

    private async _callServer(command: string): Promise<VoiceParsedCommand> {
        const worldModelAdapter = window.worldModelAdapter;
        const selectionBus      = window.selectionBus;

        const context   = worldModelAdapter ? worldModelAdapter.toPromptContext('full') : '';
        const selection = selectionBus ? (selectionBus.currentIds ?? []) : [];

        const res = await fetch(PARSE_ENDPOINT, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ command, context, selection }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        return data as VoiceParsedCommand;
    }

    /**
     * Execute the last parsed command after the user has confirmed.
     * Routes through commandManager so the action is fully undoable.
     */
    async executeConfirmed(): Promise<void> {
        const parsed = this._lastParsed;
        if (!parsed) return;
        this._lastParsed = null;
        this._emit('idle');

        const cm = window.commandManager; // TODO(TASK-06)
        if (!cm) {
            console.warn('[VoiceSpatialInterface] commandManager not available');
            return;
        }

        try {
            await this._dispatchIntent(parsed, cm);
        } catch (err) {
            console.error('[VoiceSpatialInterface] execute error:', err);
        }
    }

    cancel(): void {
        this._lastParsed = null;
        this._emit('idle');
    }

    private async _dispatchIntent(parsed: VoiceParsedCommand, cm: any): Promise<void> {
        const { intent, targets, parameters } = parsed;
        const roomStore = window.roomStore; // TODO(TASK-08)

        switch (intent) {
            case 'set-property': {
                if (!roomStore || targets.length === 0) return;
                for (const id of targets) {
                    const room = roomStore.getById(id);
                    if (!room) continue;
                    // @ts-ignore — commands/ not yet extracted to packages/ (P9-W4 blocker; dynamic import with null fallback)
                    const { UpdateRoomCommand } = await import('../commands').catch(() => ({ UpdateRoomCommand: null }));
                    if (!UpdateRoomCommand) break;
                    const updates: Record<string, unknown> = {};
                    if (parameters.area != null)          updates.targetArea     = Number(parameters.area);
                    if (parameters.occupancyType != null) updates.occupancyType  = String(parameters.occupancyType);
                    if (parameters.name != null)           updates.name          = String(parameters.name);
                    if (Object.keys(updates).length > 0) {
                        cm.execute(new UpdateRoomCommand(id, updates as any));
                    }
                }
                break;
            }

            case 'assign-template': {
                const templateStore = window.templateStore; // TODO(TASK-08)
                if (!templateStore || targets.length === 0) return;
                const templateCode = String(parameters.templateCode ?? '');
                const template = templateStore.getAll().find((t: any) =>
                    t.code?.toLowerCase() === templateCode.toLowerCase() ||
                    t.name?.toLowerCase().includes(templateCode.toLowerCase())
                );
                if (!template) {
                    console.warn('[VoiceSpatialInterface] Template not found:', templateCode);
                    return;
                }
                for (const id of targets) {
                    // @ts-ignore — commands/ not yet extracted to packages/ (P9-W4 blocker; dynamic import with null fallback)
                    const { AssignTemplateToNodeCommand } = await import('../commands').catch(() => ({ AssignTemplateToNodeCommand: null }));
                    if (!AssignTemplateToNodeCommand) break;
                    cm.execute(new AssignTemplateToNodeCommand({ nodeId: id, nodeType: 'room' as any, templateId: template.id }));
                }
                break;
            }

            case 'navigate-to': {
                const id = targets[0];
                if (!id) return;
                window.dispatchEvent(new CustomEvent('pryzm-workbench-select', { detail: { nodeId: id, nodeType: 'room' } })); // TODO(TASK-11)
                window.dispatchEvent(new CustomEvent('pryzm-navigate-to', { detail: { elementId: id } })); // TODO(TASK-11)
                break;
            }

            case 'spatial-query':
            case 'clarify':
                // These result in UI feedback only — no store mutation
                break;

            default:
                console.warn('[VoiceSpatialInterface] Unknown intent:', intent);
        }
    }
}

export const voiceSpatialInterface = new VoiceSpatialInterfaceImpl();
