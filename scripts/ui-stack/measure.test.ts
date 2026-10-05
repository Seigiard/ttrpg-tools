import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'bun:test';
import { withPreview } from './measure';

class FakeStream extends EventEmitter {
  write() {}
}

class FakePreviewProcess extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  exitCode: number | null = null;
  killedWith: NodeJS.Signals | null = null;

  kill(signal: NodeJS.Signals) {
    this.killedWith = signal;

    return true;
  }
}

describe('withPreview', () => {
  test('stops preview when readiness fails before measurement starts', async () => {
    // #given
    const proc = new FakePreviewProcess();

    // #when
    const run = withPreview(
      4410,
      async () => {
        throw new Error('work must not start before readiness');
      },
      {
        assertPortFree: async () => {},
        // SAFETY: This fake implements the process members used by withPreview.
        spawn: () => proc as never,
        waitForPreview: async () => {
          throw new Error('preview never became ready');
        },
      },
    );

    // #then
    let error: unknown;

    try {
      await run;
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);

    if (!(error instanceof Error)) throw new Error('Expected preview readiness to fail');
    expect(error.message).toContain('preview never became ready');
    expect(proc.killedWith).toBe('SIGTERM');
  });
});
