import { describe, expect, test } from 'bun:test';

import { EngineTimeoutError } from '../engine-timeout';
import {
  createPrinting,
  createVivliostylePrintPort,
  type PrintAttemptObserver,
  type PrintPort,
} from './create-printing';
import { createControlledScheduler } from './scheduler';

/** One attempt the factory handed to the engine, with the two answers the engine
 * is able to give back for it. Nothing here cancels or disposes of a run: the real
 * engine offers neither, and a fake that did would let the factory rely on it. */
interface EngineRun {
  readonly html: string;
  ready(): void;
  fail(error: Error): void;
}

/**
 * The print engine as this adapter is allowed to see it: a run is started, and
 * later reports itself either ready -- handing back the capability that opens the
 * browser's own dialogue -- or failed. `callbacksReturned` counts the answers that
 * ran to their end, which is the oracle for the real engine's cleanup: Vivliostyle
 * runs its own teardown after `printCallback` returns, so an exception thrown back
 * at it there would strand its one global print instance forever.
 */
function fakeEngine(options: { openDialogue?: () => void; startFails?: Error } = {}) {
  const runs: EngineRun[] = [];
  let dialoguesOpened = 0;
  let callbacksReturned = 0;

  const port: PrintPort = {
    start(html: string, observer: PrintAttemptObserver) {
      if (options.startFails !== undefined) throw options.startFails;

      runs.push({
        html,
        ready() {
          observer.ready(() => {
            dialoguesOpened += 1;
            options.openDialogue?.();
          });
          callbacksReturned += 1;
        },
        fail(error: Error) {
          observer.failed(error);
          callbacksReturned += 1;
        },
      });
    },
  };

  return {
    port,
    runs,
    get dialoguesOpened(): number {
      return dialoguesOpened;
    },
    get callbacksReturned(): number {
      return callbacksReturned;
    },
  };
}

function printingUnderTest(options?: { openDialogue?: () => void; startFails?: Error }) {
  const controlled = createControlledScheduler();
  const engine = fakeEngine(options);
  return { controlled, engine, printBook: createPrinting(controlled.scheduler, engine.port) };
}

/** The value a promise settles on, whichever way it settles -- `expect().rejects`
 * is typed as returning nothing here, which makes awaiting it read as a mistake. */
function settlement(promise: Promise<void>): Promise<unknown> {
  return promise.then(
    (value) => value,
    (error: unknown) => error,
  );
}

const PRINT_BOUND_MILLISECONDS = 60_000;

describe('printing single-flight', () => {
  test('hands a call made mid-attempt the attempt already running', async () => {
    // #given: a print the engine has not answered about yet
    const { engine, printBook } = printingUnderTest();
    const first = printBook('BOOK ONE');

    // #when: the author asks again before it has settled
    const second = printBook('BOOK TWO');

    // #then: both are waiting on the one run, which is still the first book --
    // a second run would repoint Vivliostyle's one global print instance
    expect(second).toBe(first);
    expect(engine.runs.map((run) => run.html)).toEqual(['BOOK ONE']);

    engine.runs[0]!.ready();
    await first;
  });

  test('starts a fresh attempt once the previous one has settled cleanly', async () => {
    // #given: a print that has run to the end
    const { controlled, engine, printBook } = printingUnderTest();
    const first = printBook('BOOK ONE');
    engine.runs[0]!.ready();
    await first;

    // #when: the author prints again
    const second = printBook('BOOK TWO');

    // #then: it is a run of its own, not the settled promise handed back again
    expect(second).not.toBe(first);
    expect(engine.runs.map((run) => run.html)).toEqual(['BOOK ONE', 'BOOK TWO']);

    engine.runs[1]!.ready();
    await second;

    // #then: and no deadline is left ticking towards a session that already printed
    expect(controlled.pendingCount()).toBe(0);
  });

  test('opens the dialogue once for an attempt the engine keeps answering about', async () => {
    // #given: a print the engine has reported ready
    const { engine, printBook } = printingUnderTest();
    const attempt = printBook('BOOK ONE');
    engine.runs[0]!.ready();
    await attempt;

    // #when: the engine says so again, and then reports a failure for the same run
    engine.runs[0]!.ready();
    engine.runs[0]!.fail(new Error('a failure arriving after the book printed'));

    // #then: the author got exactly one dialogue, and the settled promise stands
    expect(engine.dialoguesOpened).toBe(1);
    expect(await settlement(attempt)).toBeUndefined();
  });
});

describe('printing an engine does not answer', () => {
  test('gives the caller up after the bound, in the engine-timeout error', async () => {
    // #given: a print the engine is sitting on
    const { controlled, engine, printBook } = printingUnderTest();
    const attempt = printBook('BOOK ONE');
    const settled = settlement(attempt);

    // #when: the whole bound elapses with nothing said back
    controlled.advanceBy(PRINT_BOUND_MILLISECONDS);

    // #then: the caller is told how long it waited, and no dialogue was opened
    // over the author
    const error = await settled;
    expect(error).toBeInstanceOf(EngineTimeoutError);
    expect((error as EngineTimeoutError).seconds).toBe(60);
    expect(engine.dialoguesOpened).toBe(0);
  });

  test('refuses a retry while the abandoned attempt may still hold the engine', async () => {
    // #given: a print given up on
    const { controlled, engine, printBook } = printingUnderTest();
    const abandoned = printBook('BOOK ONE');
    const abandonedError = settlement(abandoned);
    controlled.advanceBy(PRINT_BOUND_MILLISECONDS);
    await abandonedError;

    // #when: the author tries again
    const retry = printBook('BOOK TWO');
    const retryError = await settlement(retry);

    // #then: nothing was handed to the engine, and the refusal is its own error
    // rather than the abandoned attempt's rejection handed round a second time
    expect(engine.runs).toHaveLength(1);
    expect(retryError).toBeInstanceOf(EngineTimeoutError);
    expect(retryError).not.toBe(await abandonedError);
  });

  test('frees the engine on a late ready without opening a dialogue', async () => {
    // #given: a print given up on, whose engine is still working
    const { controlled, engine, printBook } = printingUnderTest();
    const abandoned = printBook('BOOK ONE');
    const abandonedError = settlement(abandoned);
    controlled.advanceBy(PRINT_BOUND_MILLISECONDS);
    await abandonedError;

    // #when: the engine finally reports that book ready, minutes after the author
    // moved on
    engine.runs[0]!.ready();

    // #then: no dialogue was opened for a print nobody is waiting on any more
    expect(engine.dialoguesOpened).toBe(0);

    // #then: but the engine is free again, so the next print is a real attempt
    const next = printBook('BOOK TWO');
    expect(engine.runs.map((run) => run.html)).toEqual(['BOOK ONE', 'BOOK TWO']);
    engine.runs[1]!.ready();
    expect(await settlement(next)).toBeUndefined();
    expect(engine.dialoguesOpened).toBe(1);
  });

  test('ignores everything the abandoned attempt says after its late ready', async () => {
    // #given: an abandoned attempt that has since reported ready
    const { controlled, engine, printBook } = printingUnderTest();
    const abandoned = printBook('BOOK ONE');
    const abandonedError = settlement(abandoned);
    controlled.advanceBy(PRINT_BOUND_MILLISECONDS);
    await abandonedError;
    engine.runs[0]!.ready();

    // #when: it keeps calling back
    engine.runs[0]!.ready();
    engine.runs[0]!.fail(new Error('a failure from an attempt already finished with'));

    // #then: still no dialogue, and the engine stays free
    expect(engine.dialoguesOpened).toBe(0);
    const next = printBook('BOOK TWO');
    expect(engine.runs).toHaveLength(2);
    engine.runs[1]!.ready();
    expect(await settlement(next)).toBeUndefined();
  });
});

describe('printing the engine fails', () => {
  test('settles the caller with the failure and blocks a retry until the engine is free', async () => {
    // #given: a print in flight
    const { engine, printBook } = printingUnderTest();
    const attempt = printBook('BOOK ONE');
    const failure = new Error('Vivliostyle failed to prepare the book for printing: boom');

    // #when: the engine reports it cannot lay the book out
    engine.runs[0]!.fail(failure);

    // #then: the caller gets that very error
    expect(await settlement(attempt)).toBe(failure);

    // #then: and a retry is refused -- a failed run has not handed back
    // Vivliostyle's one global print instance, which only its ready path does
    const retry = printBook('BOOK TWO');
    expect(await settlement(retry)).toBeInstanceOf(EngineTimeoutError);
    expect(engine.runs).toHaveLength(1);

    // #then: until the failed run's engine reports ready after all
    engine.runs[0]!.ready();
    expect(engine.dialoguesOpened).toBe(0);
    const afterwards = printBook('BOOK THREE');
    expect(engine.runs).toHaveLength(2);
    engine.runs[1]!.ready();
    expect(await settlement(afterwards)).toBeUndefined();
  });

  test('settles the caller once however often the engine repeats itself', async () => {
    // #given: a print the engine has already failed
    const { engine, printBook } = printingUnderTest();
    const attempt = printBook('BOOK ONE');
    const first = new Error('Vivliostyle failed to prepare the book for printing: first');
    engine.runs[0]!.fail(first);
    expect(await settlement(attempt)).toBe(first);

    // #when: it reports a second failure for the same run
    engine.runs[0]!.fail(new Error('Vivliostyle failed to prepare the book for printing: second'));

    // #then: the caller still holds the first failure
    expect(await settlement(attempt)).toBe(first);
  });
});

describe('printing error identity', () => {
  test('rejects with the dialogue error itself and leaves the engine free to clean up', async () => {
    // #given: a browser that refuses to open its print dialogue
    const refusal = new Error('the browser refused to open a print dialogue');
    const { engine, printBook } = printingUnderTest({
      openDialogue: () => {
        throw refusal;
      },
    });

    // #when: the engine reports the book ready
    const attempt = printBook('BOOK ONE');
    engine.runs[0]!.ready();

    // #then: the caller is given that very error
    expect(await settlement(attempt)).toBe(refusal);

    // #then: and it never escaped into the engine's own callback, which has to run
    // to its end for Vivliostyle to release its global print instance
    expect(engine.callbacksReturned).toBe(1);
  });

  test('rejects with a synchronous start failure itself', async () => {
    // #given: an engine that throws the moment it is handed a book
    const refusal = new Error('the print engine could not be started');
    const { controlled, printBook } = printingUnderTest({ startFails: refusal });

    // #when: the author prints
    const attempt = printBook('BOOK ONE');

    // #then: the caller is given that very error, with no deadline left behind
    expect(await settlement(attempt)).toBe(refusal);
    expect(controlled.pendingCount()).toBe(0);
  });
});

describe('the Vivliostyle print port', () => {
  test('reports ready as a capability that opens the dialogue, never the frame itself', () => {
    // #given: a Vivliostyle that lays the book out and calls back with its frame
    let dialoguesOpened = 0;
    const iframeWindow = { print: () => (dialoguesOpened += 1) } as unknown as Window;
    const port = createVivliostylePrintPort((html, config) => {
      expect(html).toBe('<html>BOOK</html>');
      expect(config.title).toBe('Grimoire Press');
      config.printCallback(iframeWindow);
    });

    // #when: an attempt is started
    let openDialogue: (() => void) | undefined;
    port.start('<html>BOOK</html>', {
      ready: (open) => (openDialogue = open),
      failed: () => expect.unreachable(),
    });

    // #then: what came back is a capability, not the frame -- and it is what opens
    // the browser's own dialogue
    expect(dialoguesOpened).toBe(0);
    openDialogue?.();
    expect(dialoguesOpened).toBe(1);
  });

  test("turns Vivliostyle's own message into printing's error", () => {
    // #given: a Vivliostyle that reports a failure as the string it uses
    const port = createVivliostylePrintPort((_html, config) => {
      config.errorCallback?.('boom');
    });

    // #when: an attempt is started
    let failure: Error | undefined;
    port.start('<html>BOOK</html>', {
      ready: () => expect.unreachable(),
      failed: (error) => (failure = error),
    });

    // #then: the caller's side of the port only ever sees an Error, in the wording
    // the author's status surface already shows
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toBe('Vivliostyle failed to prepare the book for printing: boom');
  });
});
