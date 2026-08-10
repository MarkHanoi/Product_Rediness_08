// @pryzm/renderer-three — addon re-export: Rhino3dmLoader (.3dm import)
//
// Contract C04 §1.1 (P2): packages/renderer-three/ is the sole authorised owner
// of `three` and `three/*` specifiers. Consumers (here: @pryzm/file-format's
// RhinoImporter) must reach the loader through the '@pryzm/renderer-three'
// barrel — never through 'three/examples/jsm/loaders/3DMLoader.js' directly.
//
// The loader pulls the rhino3dm WebAssembly module at runtime; callers are
// expected to keep loading it lazily (`await import('@pryzm/renderer-three')`)
// so the wasm bridge stays out of the initial bundle.
//
// §RHINO-WARN-QUIET (L-817) — why this is a subclass and not a bare re-export:
// the vendor loader's worker onmessage handler calls `console.warn(message.data)`
// for EVERY per-object conversion warning ("Conversion not implemented for …",
// "has no associated mesh geometry", …). A large architectural .3dm emits
// thousands of these, flooding the console during import. The vendor file must
// not be edited, so we intercept at OUR boundary: wrap each pooled worker's
// onmessage, keep accumulating `loader.warnings` exactly as the vendor does
// (the fidelity report reads them off `group.userData.warnings`), but log only
// the first few to the console plus one suppression notice.

import { Rhino3dmLoader as ThreeRhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';

/** Max individual conversion warnings echoed to the console per loader instance. */
const WARN_LOG_LIMIT = 5;

type RhinoWorkerLike = Worker & { __pryzmWarnQuiet?: boolean };

/**
 * Vendor internals not present in @types/three's 3DMLoader.d.ts. `_getWorker`
 * and `warnings` are stable across three r150+ (the worker-pool design has not
 * changed); a rename in a future three upgrade fails loudly in the unit test,
 * not silently at runtime (`_getWorker` would be undefined → TypeError on call).
 */
interface LoaderInternals {
    _getWorker(taskCost: number): Promise<RhinoWorkerLike>;
    warnings: unknown[];
}

export class Rhino3dmLoader extends ThreeRhino3dmLoader {
    private _pryzmWarningsSeen = 0;

    /** Overrides the vendor worker factory to wrap each worker's onmessage once. */
    _getWorker(taskCost: number): Promise<RhinoWorkerLike> {
        const base = ThreeRhino3dmLoader.prototype as unknown as LoaderInternals;
        return base._getWorker.call(this, taskCost).then((worker: RhinoWorkerLike) => {
            if (worker.__pryzmWarnQuiet) return worker;
            worker.__pryzmWarnQuiet = true;

            const vendorOnMessage = worker.onmessage?.bind(worker);
            worker.onmessage = (e: MessageEvent) => {
                const message = e.data as { type?: string; data?: { message?: string } } | undefined;
                if (message?.type === 'warning') {
                    // Mirror the vendor bookkeeping (fidelity report reads these) …
                    (this as unknown as LoaderInternals).warnings.push(message.data);
                    // … but rate-limit the console echo (§RHINO-WARN-QUIET).
                    this._pryzmWarningsSeen++;
                    if (this._pryzmWarningsSeen <= WARN_LOG_LIMIT) {
                        console.warn('[Rhino3dmLoader]', message.data?.message ?? message.data);
                    } else if (this._pryzmWarningsSeen === WARN_LOG_LIMIT + 1) {
                        console.warn(
                            `[Rhino3dmLoader] Further conversion warnings suppressed (first ${WARN_LOG_LIMIT} shown). ` +
                            'The full list is available on the imported group\'s userData.warnings.',
                        );
                    }
                    return;
                }
                vendorOnMessage?.(e);
            };
            return worker;
        });
    }
}
