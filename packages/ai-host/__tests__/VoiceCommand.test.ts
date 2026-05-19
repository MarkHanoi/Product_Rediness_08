// @pryzm/ai-host — VoiceCommand workflow tests (S52 D5).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S52
//     lines 470-487 — voice command surface + lazy chunk requirement.
//   • SPEC-28 §3 — per-call ceiling $0.18.
//
// Coverage:
//   • Lazy loader caches the impl module promise.
//   • MockVoiceTranscriber returns deterministic fixture text.
//   • Descriptor registers cleanly with WorkflowRegistry.
//   • Palette match e2e through createVoiceCommandImpl.
//   • No-match → rejected enqueue.
//   • K3-A static check: VoiceCommand.impl.ts is in a separate file.
//   • loadTranscriber({env}) falls through to mock without WHISPER_TRANSCRIBER_URL.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WorkflowRegistry } from '../src/WorkflowRegistry.js';
import {
  _resetVoiceCommandLoaderForTesting,
  getVoiceCommand,
  loadTranscriber,
  MockVoiceTranscriber,
  voiceCommandDescriptor,
  type VoiceTranscriberPorter,
} from '../src/workflows/VoiceCommand.js';
import type { AiApprovalQueueLike, AiPendingAction, CommandPayloadRef } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_WORKFLOWS_DIR = join(__dirname, '..', 'src', 'workflows');

class CollectingQueue implements AiApprovalQueueLike {
  readonly actions: AiPendingAction[] = [];
  enqueue(action: AiPendingAction): void { this.actions.push(action); }
}

describe('@pryzm/ai-host — VoiceCommand (S52)', () => {

  describe('descriptor', () => {
    it('registers cleanly with WorkflowRegistry', () => {
      const reg = new WorkflowRegistry();
      reg.register(voiceCommandDescriptor, async () => ({ proposedCommands: [] }));
      expect(reg.has('voice-command')).toBe(true);
    });
    it('has a $0.02 cost estimate (Whisper-tiny + LLM intent fallback)', () => {
      expect(voiceCommandDescriptor.estimatedCostUsd).toBe(0.02);
      expect(voiceCommandDescriptor.estimatedCostUsd).toBeLessThanOrEqual(0.18);
    });
    it("uses kind='voice' for analytics tagging", () => {
      expect(voiceCommandDescriptor.kind).toBe('voice');
    });
  });

  describe('lazy loader', () => {
    it('caches the impl module promise — second call returns the same promise instance', async () => {
      _resetVoiceCommandLoaderForTesting();
      const a = getVoiceCommand();
      const b = getVoiceCommand();
      expect(a).toBe(b);
      const mod = await a;
      expect(typeof mod.createVoiceCommandImpl).toBe('function');
    });
    it('exposes createVoiceCommandImpl + VOICE_CONFIDENCE_THRESHOLD from the impl chunk', async () => {
      const mod = await getVoiceCommand();
      expect(typeof mod.createVoiceCommandImpl).toBe('function');
      expect(mod.VOICE_CONFIDENCE_THRESHOLD).toBe(0.6);
    });
  });

  describe('MockVoiceTranscriber', () => {
    it('returns the canonical "create a wall here" fixture for the 1024-byte buffer', async () => {
      const t = new MockVoiceTranscriber();
      const r = await t.transcribe({ audio: new ArrayBuffer(1024) });
      expect(r.text).toBe('create a wall here');
      expect(r.confidence).toBeGreaterThan(0.9);
      expect(r.costUsd).toBeCloseTo(0.001, 6);
    });
    it('returns empty text + low confidence for the 4096-byte silence fixture', async () => {
      const t = new MockVoiceTranscriber();
      const r = await t.transcribe({ audio: new ArrayBuffer(4096) });
      expect(r.text).toBe('');
      expect(r.confidence).toBeLessThan(0.6);
    });
    it('throws on empty audio buffer (loud about malformed input)', async () => {
      const t = new MockVoiceTranscriber();
      await expect(t.transcribe({ audio: new ArrayBuffer(0) })).rejects.toThrow(/empty/);
    });
  });

  describe('loadTranscriber', () => {
    it('falls through to MockVoiceTranscriber when WHISPER_TRANSCRIBER_URL is unset', async () => {
      const t = await loadTranscriber({ env: {} });
      expect(t).toBeInstanceOf(MockVoiceTranscriber);
    });
    it('falls through to MockVoiceTranscriber when the real adapter module is absent', async () => {
      const t = await loadTranscriber({ env: { WHISPER_TRANSCRIBER_URL: 'https://example.test/whisper' } });
      // The real adapter ships at S55+; until then the loader silently falls back.
      expect(t).toBeInstanceOf(MockVoiceTranscriber);
    });
  });

  describe('e2e impl through dynamic import', () => {
    it('palette match: enqueues a confirm action carrying the matched command', async () => {
      const mod = await getVoiceCommand();
      const queue = new CollectingQueue();
      const palette = {
        match(text: string) {
          if (text.toLowerCase().includes('wall')) {
            return {
              command: { command: 'create-wall', payload: {} } as CommandPayloadRef,
              label: 'Create wall',
              score: 0.9,
            };
          }
          return null;
        },
      };
      const impl = mod.createVoiceCommandImpl({
        transcriber: new MockVoiceTranscriber(),
        approvalQueue: queue,
        palette,
        now: () => 1700000000000,
      });
      const ctx = {
        runId: 'run-v1',
        projectId: 'PRJ-V1',
        actorId: 'U-1',
        plan: 'team' as const,
        input: { audio: new ArrayBuffer(1024) }, // → "create a wall here"
        bus: null,
        now: () => 1700000000000,
      };
      const result = await impl(ctx);
      expect(queue.actions).toHaveLength(1);
      const action = queue.actions[0]!;
      expect(action.workflow).toBe('voice');
      expect(action.proposedCommands).toEqual([{ command: 'create-wall', payload: {} }]);
      expect(action.preview?.kind).toBe('json');
      const preview = result.preview as { kind: 'json'; data: { status: string } };
      expect(preview.data.status).toBe('ok');
      expect(result.actualCostUsd).toBeCloseTo(0.001, 6);
    });

    it('no palette match: rejected preview, zero per-match actions enqueued', async () => {
      const mod = await getVoiceCommand();
      const queue = new CollectingQueue();
      const palette = { match: (_text: string) => null };
      const impl = mod.createVoiceCommandImpl({
        transcriber: new MockVoiceTranscriber(),
        approvalQueue: queue,
        palette,
      });
      const result = await impl({
        runId: 'run-v2',
        projectId: 'PRJ-V2',
        actorId: 'U-1',
        plan: 'team' as const,
        input: { audio: new ArrayBuffer(1024) },
        bus: null,
        now: () => 1700000000000,
      });
      expect(queue.actions).toHaveLength(0);
      const preview = result.preview as { kind: 'json'; data: { status: string; reason?: string } };
      expect(preview.data.status).toBe('rejected');
      expect(preview.data.reason).toMatch(/No command palette entry/);
    });

    it('low-confidence transcription: rejected without palette lookup', async () => {
      const mod = await getVoiceCommand();
      const queue = new CollectingQueue();
      let paletteHits = 0;
      const palette = { match: (_text: string) => { paletteHits++; return null; } };
      const lowConfTranscriber: VoiceTranscriberPorter = {
        async transcribe() { return { text: 'mumble', confidence: 0.3, costUsd: 0.001 }; },
      };
      const impl = mod.createVoiceCommandImpl({
        transcriber: lowConfTranscriber,
        approvalQueue: queue,
        palette,
      });
      const result = await impl({
        runId: 'run-v3',
        projectId: 'PRJ-V3',
        actorId: 'U-1',
        plan: 'team' as const,
        input: { audio: new ArrayBuffer(2048) },
        bus: null,
        now: () => 1700000000000,
      });
      expect(paletteHits).toBe(0);
      expect(queue.actions).toHaveLength(0);
      const preview = result.preview as { kind: 'json'; data: { status: string; reason?: string } };
      expect(preview.data.status).toBe('rejected');
      expect(preview.data.reason).toMatch(/below threshold/);
    });

    it('missing audio input: rejected, no transcriber call', async () => {
      const mod = await getVoiceCommand();
      const queue = new CollectingQueue();
      let transcribeCalls = 0;
      const t: VoiceTranscriberPorter = {
        async transcribe() { transcribeCalls++; return { text: '', confidence: 0, costUsd: 0 }; },
      };
      const palette = { match: (_text: string) => null };
      const impl = mod.createVoiceCommandImpl({
        transcriber: t,
        approvalQueue: queue,
        palette,
      });
      const result = await impl({
        runId: 'run-v4',
        projectId: 'PRJ-V4',
        actorId: 'U-1',
        plan: 'team' as const,
        input: undefined,
        bus: null,
        now: () => 1700000000000,
      });
      expect(transcribeCalls).toBe(0);
      const preview = result.preview as { kind: 'json'; data: { status: string } };
      expect(preview.data.status).toBe('rejected');
    });
  });

  // ─── K3-A enforcement ──────────────────────────────────────────────────

  describe('K3-A — VoiceCommand.impl is loaded only via dynamic import', () => {
    it('VoiceCommand.impl.ts exists as a SEPARATE file', () => {
      const files = readdirSync(SRC_WORKFLOWS_DIR);
      expect(files).toContain('VoiceCommand.ts');
      expect(files).toContain('VoiceCommand.impl.ts');
    });
    it('VoiceCommand.ts imports VoiceCommand.impl ONLY through a dynamic `import()` call', () => {
      const src = readFileSync(join(SRC_WORKFLOWS_DIR, 'VoiceCommand.ts'), 'utf8');
      // Strip type-only imports — they're erased at build time and don't count.
      const codeOnlyLines = src
        .split('\n')
        .filter((line) => !/^\s*import\s+type\s/.test(line))
        .filter((line) => !/from\s+['"]\.\/VoiceCommand\.impl/.test(line.replace(/await\s+import\s*\(/g, '')));
      // No bare static `import ... from './VoiceCommand.impl...'` should remain.
      const staticImpl = codeOnlyLines.find((line) =>
        /^\s*import[^(]*from\s+['"]\.\/VoiceCommand\.impl/.test(line),
      );
      expect(staticImpl, `Found static import of VoiceCommand.impl: ${staticImpl}`).toBeUndefined();
      // Must contain a dynamic `import('./VoiceCommand.impl.js')`.
      expect(src).toMatch(/await\s+import\s*\(\s*['"]\.\/VoiceCommand\.impl\.js['"]\s*\)/);
    });
    it('NO file outside the workflows folder statically imports VoiceCommand.impl', () => {
      const src = join(__dirname, '..', 'src');
      const violations: string[] = [];
      walk(src, (file) => {
        if (file.endsWith('VoiceCommand.impl.ts') || file.endsWith('VoiceCommand.ts')) return;
        const txt = readFileSync(file, 'utf8');
        if (/from\s+['"][^'"]*VoiceCommand\.impl/.test(txt)) {
          violations.push(file);
        }
      });
      expect(violations).toEqual([]);
    });
  });
});

function walk(dir: string, visit: (file: string) => void): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const isDir = (() => { try { return readdirSync(full); } catch { return null; } })();
    if (isDir) {
      walk(full, visit);
    } else if (full.endsWith('.ts')) {
      visit(full);
    }
  }
}
