// §ENVELOPE-AXES-CONTROL (L-6910..L-6916 · C58 §1.17 · C84 EI-1) — THE SECOND CONTROL.
//
// Founder 2026-08-22: *"There is a bug on 'envelope off' — the shade goes back."*
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ IT IS NOT A LOGIC BUG. THE MODEL HAS TWO AXES AND THE UI HAD ONE BUTTON.
// ═══════════════════════════════════════════════════════════════════════════════
// `envelopeVisibility.ts` has carried TWO persisted booleans since §ENVELOPE-TWO-AXES
// (L-1188), and its header names this exact gap in advance:
//
//   *"The `Envelope: ON/OFF` control writes the VOLUME axis only; the FOOTPRINT axis
//    exists so 'hide everything' is expressible without a fifth authority, and so a
//    future control has exactly one place to write."*
//
// That future control was never built. So the runtime was behaving precisely as
// designed — the founder's own console says so:
//
//   §ENVELOPE-ONE-VISIBILITY — buildable envelope VOLUME set HIDDEN by the user
//      (ground footprint shade STAYS — §ENVELOPE-TWO-AXES); 2 surface(s) notified.
//   §ENVELOPE-ONE-VISIBILITY — … mode=ground-shade: … drawing 1 flat GROUND FOOTPRINT
//      shade(s) instead
//
// — and it was still a defect, because a control labelled **OFF** that leaves a visible
// artefact on the plot is misleading however good the reasoning behind the artefact is.
// The state he asked for ("hide everything") is perfectly representable in the model
// (`envelopeDrawMode({volume:false, footprint:false})` → `'none'`, MEASURED at
// `packages/site-parcel-data/src/envelopeToMassing.ts:543`) and was **unreachable from
// the UI**. That is the [[authored-but-unwired-is-the-bottleneck]] shape exactly: the
// capability existed and no surface could reach it.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ THE FIX IS NOT "MAKE THE ONE BUTTON WRITE BOTH AXES"
// ═══════════════════════════════════════════════════════════════════════════════
// That deletes the distinction L-1188 was created to introduce. The two representations
// answer DIFFERENT questions —
//
//   VOLUME    "what mass may I build?"      obstructive; turned off to see the design
//   FOOTPRINT "what area may I build on?"   flat; occludes nothing
//
// — and the footprint is useful *precisely when* the volume is off, which is why L-1188
// made it survive. Collapsing them would re-close the founder's OTHER report
// (2026-08-19: *"When the envelope is OFF we should see this shade on the GROUND"*).
// Two founder asks, opposite directions, one control: the control has to grow, not pick
// a side.
//
// ── THE DECISION: TWO LABELLED TOGGLES, NOT A TRI-STATE ───────────────────────
//
// A tri-state cycle (volume → shade → none) is fewer pixels and was rejected. Three
// reasons, in order of weight:
//
//   1. A cycle makes the CURRENT state readable only by reading a label, and it makes
//      the NEXT state guessable only by trying. Two switches show both answers at once
//      and each is independently addressable — which matches the model, where the axes
//      are genuinely independent booleans, not three points on a line.
//   2. `{volume: true, footprint: false}` is a real, persistable state that a cycle
//      cannot express. It is not currently *distinguishable on screen* (`envelopeDrawMode`
//      returns `'volume'` for it, because the volume's own base IS the footprint and a
//      coplanar shade would z-fight) — but it is a stored preference that survives, and
//      it decides what the user sees the moment they hide the volume. A control that
//      cannot set half of its own model's state space is the gap this file is fixing;
//      re-introducing a smaller version of it would be a poor trade.
//   3. The persisted keys are per-axis. A cycle would need its own ordering rule on top
//      of them — a fifth thing that can disagree, which is what L-1170 spent a whole
//      module removing.
//
// ── WHAT THIS FILE IS, AND IS NOT ─────────────────────────────────────────────
// It is a PURE producer: axes in, HTML out; plus a wiring function that binds clicks to
// callbacks. It holds NO state, reads NO global, and calls NO setter itself. The
// authority stays `envelopeVisibility.ts` and the projection rule stays the L2
// `applyEnvelopeVisibilityAxes` — this is the missing SURFACE, not a new answer.
//
// ⚠ ONE PRODUCER, EVERY HOST. The envelope card is a singleton element re-homed between
// the 3D-site viewport, the GIS rail slot and the Parcel rail slot (`getForma3dHostEl`,
// GISAreaLayout.ts:2307). Because the control is rendered INTO that card by its one
// template, all three hosts get the same control and the same state by construction —
// there is no second copy to keep in sync.

import type { EnvelopeVisibilityAxes } from '@pryzm/site-parcel-data';

/** `data-testid` of the VOLUME switch.
 *  ⚠ UNCHANGED from the single-button era on purpose: it is the same axis the old
 *  `Envelope: ON/OFF` button wrote, `makeDraggable` excludes it by this selector
 *  (GISAreaLayout.ts:2389), and `makeDraggableOffsetParent.test.ts:111` pins it. A rename
 *  would silently re-enable drag-on-click and break a passing test for no gain. */
export const ENVELOPE_VOLUME_TOGGLE_TESTID = 'envelope-toggle';

/** `data-testid` of the FOOTPRINT switch — the control that never existed. */
export const ENVELOPE_FOOTPRINT_TOGGLE_TESTID = 'envelope-footprint-toggle';

/** `data-testid` of the caption that states, in words, what is on screen right now. */
export const ENVELOPE_AXES_CAPTION_TESTID = 'envelope-axes-caption';

/** Selectors `makeDraggable` must exclude, so a click on either switch never starts a drag. */
export const ENVELOPE_AXES_DRAG_EXCLUDE: readonly string[] = [
    `[data-testid="${ENVELOPE_VOLUME_TOGGLE_TESTID}"]`,
    `[data-testid="${ENVELOPE_FOOTPRINT_TOGGLE_TESTID}"]`,
];

/**
 * The sentence under the switches — what is ACTUALLY on the plot, for each of the three
 * distinguishable draw modes.
 *
 * ⭐ THIS IS THE HALF THAT FIXES THE FOUNDER'S REPORT. The old caption only appeared when
 * the volume was off, and it described the shade as a feature. It never said the shade
 * could be turned off, so a user seeing it after pressing OFF had no way to learn that
 * the state they wanted existed. Every arm now names what is drawn AND what the other
 * switch would change.
 *
 * ⚠ The estimated-confidence qualifier is preserved from the original caption and is NOT
 * decoration: the shade is drawn from the same provisional determination the card above
 * describes, so its honesty caveat has to travel with it (§L-616 / C58 §1.16 — a shade
 * that reads authoritative on a default rule pack is the overstatement defect in a new
 * shape).
 */
export function envelopeAxesCaption(axes: EnvelopeVisibilityAxes): string {
    if (axes.volume) {
        return 'Showing the buildable study volume. Its base is the buildable footprint, so no '
            + 'separate ground shade is drawn while the volume is on.';
    }
    if (axes.footprint) {
        return 'Volume hidden. The buildable footprint is still shaded on the ground, at the same '
            + 'confidence as the figures above — turn Footprint off to clear the plot completely.';
    }
    return 'Both hidden — nothing is drawn for the buildable envelope. The determination above is '
        + 'unchanged; only what is shown on the plot has been turned off.';
}

/** Escape for the one interpolation sink in this file. Static markup everywhere else. */
function escHtml(value: unknown): string {
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * One switch. Purple-on-white when off, solid purple when on — the PRYZM palette, no
 * black anywhere (C06 §7.3 / the founder's standing brand rule).
 */
function switchHtml(opts: {
    testId: string;
    label: string;
    on: boolean;
    title: string;
}): string {
    const { testId, label, on, title } = opts;
    return `<button type="button" role="switch" aria-checked="${on ? 'true' : 'false'}"
        data-testid="${escHtml(testId)}" title="${escHtml(title)}"
        style="flex:1 1 0;min-width:0;appearance:none;cursor:pointer;padding:6px 8px;border-radius:7px;
               border:1px solid #6600FF;font:600 11px system-ui;line-height:1.25;text-align:center;
               background:${on ? '#6600FF' : '#ffffff'};color:${on ? '#ffffff' : '#6600FF'};">
        ${escHtml(label)}: ${on ? 'ON' : 'OFF'}
      </button>`;
}

/**
 * ⭐ THE CONTROL. Both axes, both switches, and a caption that states the resulting view.
 *
 * Pure: it renders the axes it is HANDED. It does not read `envelopeVisibility.ts`, so a
 * test can drive all four combinations without touching localStorage or a module global,
 * and the card can never display a state the authority disagrees with (the host reads the
 * authority once, at render, and passes it in).
 */
export function buildEnvelopeAxesControlHtml(axes: EnvelopeVisibilityAxes): string {
    return `<div data-testid="envelope-axes-control" style="margin-top:10px;">
        <div style="font:700 9.5px system-ui;letter-spacing:0.04em;text-transform:uppercase;color:#6600FF;margin-bottom:4px;">
          Show on the plot
        </div>
        <div style="display:flex;gap:6px;align-items:stretch;">
          ${switchHtml({
              testId: ENVELOPE_VOLUME_TOGGLE_TESTID,
              label: 'Volume',
              on: axes.volume,
              title: 'The extruded buildable study volume — "what mass may I build?". '
                  + 'Turning it off leaves the flat ground footprint, which is controlled separately.',
          })}
          ${switchHtml({
              testId: ENVELOPE_FOOTPRINT_TOGGLE_TESTID,
              label: 'Footprint',
              on: axes.footprint,
              title: 'The flat ground shade — "what area may I build on?". '
                  + 'It is only drawn when the volume is off, because the volume already stands on it.',
          })}
        </div>
        <div data-testid="${ENVELOPE_AXES_CAPTION_TESTID}"
             style="margin-top:5px;font:500 10px system-ui;color:#8a83a0;line-height:1.4;">
          ${escHtml(envelopeAxesCaption(axes))}
        </div>
      </div>`;
}

/**
 * Bind the two switches inside `root` to the two writes.
 *
 * ⛔ The callbacks are the AUTHORITY's setters, passed in. This function does not import
 * them: a control that both renders and writes is one refactor away from also deciding,
 * which is how L-1170 ended up with four answers to one question. It binds; the caller
 * owns the write; the subscribers repaint themselves.
 *
 * Idempotent — assigns `onclick` rather than adding a listener, so a card re-render that
 * re-wires the same nodes cannot stack handlers and toggle twice per click.
 */
export function wireEnvelopeAxesControl(
    root: ParentNode,
    handlers: {
        onToggleVolume: () => void;
        onToggleFootprint: () => void;
    },
): void {
    const vol = root.querySelector(`[data-testid="${ENVELOPE_VOLUME_TOGGLE_TESTID}"]`);
    if (vol instanceof HTMLElement) {
        (vol as HTMLButtonElement).onclick = () => handlers.onToggleVolume();
    }
    const fp = root.querySelector(`[data-testid="${ENVELOPE_FOOTPRINT_TOGGLE_TESTID}"]`);
    if (fp instanceof HTMLElement) {
        (fp as HTMLButtonElement).onclick = () => handlers.onToggleFootprint();
    }
}
