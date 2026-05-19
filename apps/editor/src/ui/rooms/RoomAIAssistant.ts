/**
 * @file RoomAIAssistant.ts
 * @description Wave 14 — F.7.6 — runtime.ai.streamCompletion wiring.
 *   Room-context AI assistant that streams completion through the AI relay.
 *   Phase F stub: streamCompletion throws RuntimeNotWiredError; Phase F.7.4
 *   wires the real AnthropicRelay.
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export interface RoomAIRequest {
    readonly roomId: string;
    readonly prompt: string;
}

export class RoomAIAssistant {
    private readonly _runtime: Runtime | null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    /** Stream a room-context AI completion through runtime.ai. */
    async ask(req: RoomAIRequest): Promise<string> {
        if (!this._runtime) {
            console.warn('[RoomAIAssistant] runtime not available');
            return '';
        }

        // F.7.6 — runtime.ai.dispatch wiring
        const chunks: string[] = [];
        const result = await this._runtime.ai.streamCompletion(
            req.prompt,
            { projectId: null, selectionIds: [req.roomId] },
            (chunk) => {
                if (chunk.kind === 'token') chunks.push(chunk.delta);
            },
        );
        return result.text;
    }

    /** Check entitlements before surfacing AI room features. */
    canUseRoomAI(): boolean {
        return this._runtime?.entitlements.check('ai.room') ?? false;
    }
}
