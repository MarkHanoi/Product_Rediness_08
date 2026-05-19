// @pryzm/ai-worker — CV runtime selector (S50 D1).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S50 line 270 ("the segmentation model has two compiled forms —
// ONNX-CUDA for GPU workers, ONNX-CPU for CPU workers. The job
// dispatcher routes based on worker availability per SPEC-15 §2.4").
//
// At S50 the real ONNX adapter is NOT installed — Replit dev does
// not have a CUDA device and we don't want to add the `onnxruntime-
// node` dep until S52 when the live Vision relay arrives. The mock
// runtime returned here is deterministic and has the same surface,
// so the page-classification + segmentation modules can target it
// today and swap with no source change later.

import type { CvEnv, ModelRuntime, ModelRuntimeKind } from './types.js';

/** The deterministic mock runtime used in dev + tests. Marked
 *  `mock: true` so handlers / benches can assert against it. */
export const MOCK_RUNTIME: ModelRuntime = {
  kind: 'cpu',
  version: 'mock-0.1.0',
  mock: true,
};

/** Selects a runtime kind from env. The real adapter loader lives
 *  inside `loadRuntime()` below; this function answers the smaller
 *  question "which kind would we ask for?". */
export function selectRuntimeKind(env: CvEnv = {}): ModelRuntimeKind {
  const explicit = env.PRYZM_AI_CV_RUNTIME;
  if (explicit === 'gpu') return 'gpu';
  if (explicit === 'cpu' || explicit === 'mock') return 'cpu';
  // Auto-detect: GPU if CUDA_VISIBLE_DEVICES is non-empty, else CPU.
  if (env.CUDA_VISIBLE_DEVICES && env.CUDA_VISIBLE_DEVICES.length > 0) {
    return 'gpu';
  }
  return 'cpu';
}

/** Loads the runtime for the current env. Mirrors the
 *  `createQueue({env})` selection pattern from `queue.ts` — explicit
 *  override wins; otherwise GPU vs CPU is auto-detected; the actual
 *  ONNX adapter is dynamically imported (and currently absent) so
 *  the dep is optional. */
export async function loadRuntime(env: CvEnv = {}): Promise<ModelRuntime> {
  const explicit = env.PRYZM_AI_CV_RUNTIME;

  // Mock is the dev/test default and the explicit "force mock" path.
  if (explicit === 'mock') return MOCK_RUNTIME;

  const kind = selectRuntimeKind(env);

  // Try to load the real ONNX adapter — currently absent until S52.
  // Failure to load is silent and falls through to the mock so that
  // the dev path always works. A loud error would only fire if the
  // operator explicitly forced GPU/CPU via env AND the adapter were
  // installed AND it threw during construction.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(
      /* @vite-ignore */ './onnx-runtime.js' as string
    ).catch(() => null);
    if (mod?.createOnnxRuntime) {
      return mod.createOnnxRuntime({ kind, env }) as ModelRuntime;
    }
  } catch {
    // Fall through to mock.
  }

  return MOCK_RUNTIME;
}
