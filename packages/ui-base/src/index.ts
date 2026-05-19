// @pryzm/ui-base — public surface.
//
// Phase B.1 (S73-WIRE) deliverable per `14-subphases-A-D.md` §16.2 row B.1.
// Future phases extend with shared atoms (Button, Field, Slider) at the
// pace `src/ui/` panels need them; today, only the lifecycle base ships.

export { Panel, type PanelOptions, type PanelDisposable } from './Panel.js';
export { withPanelSpan } from './otel.js';
export { FocusTrap } from './FocusTrap.js';
export { escHtml, escAttr } from './sanitize.js';
