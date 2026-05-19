// @pryzm/plugin-ai-voice — plugin descriptor (S52 D1).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S52 — "Voice spatial interface as plugin".  The real impl lives at
// `packages/ai-host/src/workflows/VoiceCommand.impl.ts` and is wired
// through `getAiHost()` so this package contributes ZERO bytes of
// `AiHost.impl` to the editor's first-paint chunk per [strategic
// ADR-014].

export const PLUGIN_ID = 'ai-voice' as const;
export const WORKFLOW_ID = 'ai.voice.command' as const;

export interface AiVoicePluginDescriptor {
  readonly id: typeof PLUGIN_ID;
  readonly title: string;
  readonly workflowKind: 'voice';
  readonly workflowId: typeof WORKFLOW_ID;
  readonly sidebarSlot: 'ai-workflows';
  readonly enabled: boolean;
  readonly estimatedCostUsd: number;
  readonly featureFlag: string | null;
  /** True iff browser SpeechRecognition is required.  The editor's
   *  feature-detect gate hides the plugin when false. */
  readonly requiresSpeechRecognition: boolean;
}

export const aiVoiceDescriptor: AiVoicePluginDescriptor = Object.freeze({
  id: PLUGIN_ID,
  title: 'AI Voice Commands',
  workflowKind: 'voice',
  workflowId: WORKFLOW_ID,
  sidebarSlot: 'ai-workflows',
  enabled: false,
  estimatedCostUsd: 0.05,
  featureFlag: 'pryzm.ai.voice',
  requiresSpeechRecognition: true,
});
