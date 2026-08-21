/**
 * linkBusHandlers — the FOUR bus verbs that own linked-model state (P6).
 *
 *   link.create        add a link to another project
 *   link.remove        drop it
 *   link.setDisplay    massing / detailed / hidden
 *   link.setPin        pin to a version, or follow latest
 *
 * ── WHY THESE ARE REAL HANDLERS AND NOT A BRIDGE ────────────────────────────
 *
 * The obvious precedent, `CREATE_UNDERLAY`, is a BRIDGE and must not be copied:
 * `initBusHandlers.ts:2818` declares `stores: []`, validates only
 * `typeof cmd.execute === 'function'` (the payload is a pre-constructed legacy
 * `Command` instance), routes undo through two `window.__pryzm*UnderlayInternal`
 * hooks, and appears in NEITHER `packages/command-bus/src/commands.ts` NOR
 * `docs/04-reference/API-VERB-REGISTER.md` (L-2905). Copying it would import an
 * escape hatch into a brand-new feature.
 *
 * These are shaped on `plugins/view/src/handlers/SetViewUnderlay.ts` instead: a
 * typed payload, a `canExecute` that returns a NAMED reason, an `execute` wrapped
 * in `withHandlerSpan` (P8 / C10 §2).
 *
 * ── UNDO IS DECLARED **NONE**, AND THAT IS A CHOICE, NOT AN OMISSION ────────
 *
 * `affectedStores: []`. Linking is REFERENCE MANAGEMENT, not a model edit: the
 * host's own geometry is byte-identical before and after. Folding "I opened a
 * reference to another file" into the same undo stack as "I moved a wall" would
 * mean Ctrl-Z after a wall move could silently un-link a coordination model — a
 * strictly worse outcome than not being undoable.
 *
 * The escape hatch exists and is one gesture: the panel's own Unlink / Re-link
 * controls. Per [[refusing-half-needs-its-escape-hatch]] a declared refusal is
 * only legitimate when the user can still get where they were going, and here
 * they can.
 *
 * C69 §3.3: the verb register is REGENERATED in the same change as these
 * registrations, never hand-edited.
 * C68 §5.b: each verb carries exactly one chat declaration — see
 * `packages/ai-host/src/capabilities/ChatCommandClassification.ts`.
 */

import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    createLinkedModelId,
    explicitAnchor,
    isLinkedModelId,
    LinkedModelRefSchema,
    resolveLinkAnchor,
    type LinkAnchor,
    type LinkDisplayMode,
    type LinkedModelRef,
    type LinkGeoOrigin,
    type LinkPin,
} from '@pryzm/schemas';
import { linkedModelStore } from './LinkedModelStore';
import { linkedModelController } from './linkedModelController';

// ── Payloads ────────────────────────────────────────────────────────────────

export interface LinkCreatePayload {
    readonly sourceProjectId: string;
    readonly sourceProjectName?: string;
    readonly hostProjectId: string;
    /** Defaults to `{ mode: 'pinned' }` semantics at the call site; required here so the choice is explicit. */
    readonly pin: LinkPin;
    /** The host's site origin, or null when it has none. */
    readonly hostOrigin: LinkGeoOrigin | null;
    /** The source's site origin, or null when it has none. */
    readonly sourceOrigin: LinkGeoOrigin | null;
    /**
     * Set when the user accepted an INADVISABLE separation, or placed the link by
     * hand. Absent ⇒ the anchor is derived and a C83 refusal is honoured.
     */
    readonly explicitTransform?: { east: number; north: number; elevation: number; rotationY: number };
    readonly discipline?: string;
    readonly display?: LinkDisplayMode;
    /**
     * The user has SEEN and accepted the separation warning. Without this an
     * INADVISABLE link is refused by name rather than placed — C83: always ASK.
     */
    readonly confirmedSeparation?: boolean;
}

export interface LinkRemovePayload { readonly linkId: string }
export interface LinkSetDisplayPayload { readonly linkId: string; readonly display: LinkDisplayMode }
export interface LinkSetPinPayload { readonly linkId: string; readonly pin: LinkPin }

interface Validation { valid: boolean; reason?: string }

const NOW = (): string => new Date().toISOString();

/**
 * Decide the anchor for a create, or return the refusal.
 *
 * Split out of `canExecute` so the SAME decision drives both the validation and
 * the execution — two copies of a placement rule is how a UI comes to say "yes"
 * about something the handler then places somewhere else.
 */
function decideAnchor(cmd: LinkCreatePayload): { anchor: LinkAnchor } | { refusal: string } {
    if (cmd.explicitTransform != null) {
        return {
            anchor: explicitAnchor(
                {
                    east: cmd.explicitTransform.east,
                    north: cmd.explicitTransform.north,
                    elevation: cmd.explicitTransform.elevation,
                    rotationY: cmd.explicitTransform.rotationY,
                },
                cmd.hostOrigin, cmd.sourceOrigin, NOW(),
            ),
        };
    }

    const decision = resolveLinkAnchor(cmd.hostOrigin, cmd.sourceOrigin, NOW());
    if (decision.verdict === 'IMPOSSIBLE' || decision.anchor === null) {
        return { refusal: decision.reason ?? 'This link cannot be placed automatically.' };
    }
    if (decision.verdict === 'INADVISABLE' && cmd.confirmedSeparation !== true) {
        return { refusal: decision.reason ?? 'The two projects are implausibly far apart.' };
    }
    return { anchor: decision.anchor };
}

// ── Registration ────────────────────────────────────────────────────────────

/**
 * Register the four link verbs on the composed runtime's bus.
 *
 * Guarded against duplicate registration the same way `initBusHandlers` guards
 * its own (`:2842`): `CommandBus.register()` throws on a duplicate type, and a
 * red console error per boot is noise that trains people to ignore the console.
 */
export function registerLinkedModelHandlers(runtime: PryzmRuntime): void {
    const bus = runtime?.bus;
    if (bus == null) {
        console.warn('[linkBusHandlers] no bus on runtime — link verbs NOT registered.');
        return;
    }

    const reg = (
        type: string,
        canExecute: (cmd: any) => Validation,
        execute: (cmd: any) => void,
    ): void => {
        if (bus.registry?.has?.(type as any)) return;
        try {
            bus.register({
                type: type as any,
                affectedStores: [] as any,
                canExecute: (_ctx: any, cmd: any) => canExecute(cmd),
                execute: (_ctx: any, cmd: any): any =>
                    withHandlerSpan(`${type}.handler`, { 'pryzm.command.type': type }, () => {
                        execute(cmd);
                        // No patches: `affectedStores` is empty by design (see the header).
                        return { forward: [], inverse: [], affectedStores: [] };
                    }),
            } as any);
        } catch (e) {
            console.error(`[linkBusHandlers] ${type} registration failed (non-fatal):`, e);
        }
    };

    // ── link.create ─────────────────────────────────────────────────────────
    reg(
        'link.create',
        (cmd: LinkCreatePayload) => {
            if (!cmd?.sourceProjectId) return { valid: false, reason: 'sourceProjectId is required' };
            if (!cmd?.hostProjectId) return { valid: false, reason: 'hostProjectId is required' };
            if (cmd.sourceProjectId === cmd.hostProjectId) {
                return { valid: false, reason: 'A project cannot link itself.' };
            }
            if (linkedModelStore.hasSource(cmd.sourceProjectId)) {
                return {
                    valid: false,
                    reason: `"${cmd.sourceProjectName ?? cmd.sourceProjectId}" is already linked into `
                        + 'this project. Remove the existing link first, or change its version pin.',
                };
            }
            if (cmd?.pin?.mode !== 'pinned' && cmd?.pin?.mode !== 'latest') {
                return { valid: false, reason: 'pin.mode must be "pinned" or "latest" — an undeclared version choice is not accepted (ADR-0346 D5).' };
            }
            const anchored = decideAnchor(cmd);
            if ('refusal' in anchored) return { valid: false, reason: anchored.refusal };
            return { valid: true };
        },
        (cmd: LinkCreatePayload) => {
            const anchored = decideAnchor(cmd);
            if ('refusal' in anchored) {
                // canExecute already refused; reaching here means someone dispatched
                // past it. Refuse loudly rather than placing something arbitrary.
                console.warn(`[link.create] refused at execute: ${anchored.refusal}`);
                return;
            }
            const ref: LinkedModelRef = LinkedModelRefSchema.parse({
                id: createLinkedModelId(),
                sourceProjectId: cmd.sourceProjectId,
                sourceProjectName: cmd.sourceProjectName ?? '',
                hostProjectId: cmd.hostProjectId,
                pin: cmd.pin,
                anchor: anchored.anchor,
                display: cmd.display ?? 'massing',
                discipline: cmd.discipline ?? 'architectural',
                linkedAt: NOW(),
            });
            linkedModelStore.put(ref);
            console.log(
                `[link.create] linked ${ref.sourceProjectId} into ${ref.hostProjectId} `
                + `(${ref.anchor.mode}, ${ref.pin.mode}, display=${ref.display})`,
            );
        },
    );

    // ── link.remove ─────────────────────────────────────────────────────────
    reg(
        'link.remove',
        (cmd: LinkRemovePayload) => {
            if (!cmd?.linkId) return { valid: false, reason: 'linkId is required' };
            if (!isLinkedModelId(cmd.linkId)) return { valid: false, reason: `"${cmd.linkId}" is not a link id.` };
            if (linkedModelStore.get(cmd.linkId) === undefined) {
                return { valid: false, reason: `Link "${cmd.linkId}" is not present in this project.` };
            }
            return { valid: true };
        },
        (cmd: LinkRemovePayload) => {
            const removed = linkedModelStore.remove(cmd.linkId);
            if (removed !== undefined) {
                console.log(`[link.remove] unlinked ${removed.sourceProjectId} (${cmd.linkId})`);
            }
        },
    );

    // ── link.setDisplay ─────────────────────────────────────────────────────
    reg(
        'link.setDisplay',
        (cmd: LinkSetDisplayPayload) => {
            if (!cmd?.linkId) return { valid: false, reason: 'linkId is required' };
            const existing = linkedModelStore.get(cmd.linkId);
            if (existing === undefined) return { valid: false, reason: `Link "${cmd.linkId}" is not present in this project.` };
            if (cmd.display !== 'massing' && cmd.display !== 'detailed' && cmd.display !== 'hidden') {
                return { valid: false, reason: `display must be "massing", "detailed" or "hidden" — got "${String(cmd.display)}".` };
            }
            if (cmd.display === 'detailed') {
                // §LINK-DETAILED-NOT-BUILT — DECLARED, not silently accepted. The
                // detailed representation is deferred (SPEC-LINKED-MODELS §10) and a
                // control that dispatches into nothing is exactly what C82 §1.2
                // forbids. Refusing BY NAME is the legal state; pretending is not.
                return {
                    valid: false,
                    reason: 'Full detail for linked models is not built yet — only massing is. '
                        + 'The massing shows the linked building level by level and costs one draw call. '
                        + 'See SPEC-LINKED-MODELS §10.',
                };
            }
            return { valid: true };
        },
        (cmd: LinkSetDisplayPayload) => {
            const existing = linkedModelStore.get(cmd.linkId);
            if (existing === undefined) return;
            linkedModelStore.put({ ...existing, display: cmd.display });
        },
    );

    // ── link.setPin ─────────────────────────────────────────────────────────
    reg(
        'link.setPin',
        (cmd: LinkSetPinPayload) => {
            if (!cmd?.linkId) return { valid: false, reason: 'linkId is required' };
            if (linkedModelStore.get(cmd.linkId) === undefined) {
                return { valid: false, reason: `Link "${cmd.linkId}" is not present in this project.` };
            }
            if (cmd?.pin?.mode === 'pinned') {
                if (!cmd.pin.versionId) return { valid: false, reason: 'pin.versionId is required when pinning.' };
                return { valid: true };
            }
            if (cmd?.pin?.mode === 'latest') return { valid: true };
            return { valid: false, reason: 'pin.mode must be "pinned" or "latest".' };
        },
        (cmd: LinkSetPinPayload) => {
            const existing = linkedModelStore.get(cmd.linkId);
            if (existing === undefined) return;
            linkedModelStore.put({ ...existing, pin: cmd.pin });
        },
    );

    // The store broadcasts on every mutation; the controller listens. This line is
    // only the FIRST paint after boot, for links restored from the snapshot before
    // the renderer existed.
    void linkedModelController.syncAll();

    console.log('[linkBusHandlers] link.create / link.remove / link.setDisplay / link.setPin registered.');
}
