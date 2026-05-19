// CubeTool — keyboard-driven cube movement tool (S02 / dev-only demo).
//
// Wave 12 recipe completion: toy-cube plugin tool.ts (previously missing).
//
// Moves the active cube via WASD/arrow keys, dispatching cube.move
// commands through the command bus. Used in the Hello-Cube demo scene
// to verify the command → handler → store → committer → THREE pipeline.

/** Loose CommandBus shape — avoids a direct @pryzm/command-bus import. */
export interface CubeCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export interface CubeToolOptions {
  readonly commandBus: CubeCommandBus;
  readonly activeCubeId: string;
  /** Step size per keypress in world units. Default: 0.5. */
  readonly step?: number;
  readonly onError?: (err: unknown) => void;
}

/**
 * CubeTool listens for WASD/arrow keys and dispatches cube.move commands.
 * Construct once per active session; call dispose() on deactivation.
 */
export class CubeTool {
  private readonly commandBus: CubeCommandBus;
  private readonly cubeId: string;
  private readonly step: number;
  private readonly onError: (err: unknown) => void;
  private disposed = false;
  private readonly keyDownHandler: (e: KeyboardEvent) => void;

  constructor(opts: CubeToolOptions) {
    this.commandBus = opts.commandBus;
    this.cubeId = opts.activeCubeId;
    this.step = opts.step ?? 0.5;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[CubeTool] error:', err);
    });

    this.keyDownHandler = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.keyDownHandler);
  }

  dispose(): void {
    if (this.disposed) return;
    window.removeEventListener('keydown', this.keyDownHandler);
    this.disposed = true;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.disposed) return;
    let dx = 0, dy = 0, dz = 0;
    switch (e.key) {
      case 'ArrowLeft':  case 'a': case 'A': dx = -this.step; break;
      case 'ArrowRight': case 'd': case 'D': dx = +this.step; break;
      case 'ArrowUp':    case 'w': case 'W': dz = -this.step; break;
      case 'ArrowDown':  case 's': case 'S': dz = +this.step; break;
      case 'PageUp':                         dy = +this.step; break;
      case 'PageDown':                       dy = -this.step; break;
      default: return;
    }
    this.commandBus
      .executeCommand('cube.move', { id: this.cubeId, dx, dy, dz })
      .catch(this.onError);
  }
}
