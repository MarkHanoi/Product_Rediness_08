// FIXTURE: this file is intentionally invalid.
// `pryzm/affected-stores-required` MUST flag it.
// Used as the regression test for the rule scaffold (S01) and the
// real AST walker (S02).

interface CommandHandler<T> {
  type: string;
  execute(payload: T): Promise<{ forward: unknown[]; inverse: unknown[] }>;
}

export class BrokenHandler implements CommandHandler<{ x: number }> {
  type = 'broken.cmd';

  async execute(_p: { x: number }) {
    return { forward: [], inverse: [] };
  }
}
