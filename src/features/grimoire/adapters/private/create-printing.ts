import { printHTML } from '@vivliostyle/core';

import { EngineTimeoutError } from '../engine-timeout';
import type { Schedule, Scheduler } from './scheduler';

const PRINT_TIMEOUT_SECONDS = 60;

/**
 * What one print attempt hears back from the print engine.
 *
 * `ready` hands over the ability to open the browser's print dialogue rather than
 * the frame that dialogue belongs to: printing's lifecycle decides *whether* a
 * dialogue may still be opened for this attempt, and nothing beyond that decision
 * should be able to reach into the engine's own document.
 *
 * Neither answer is a promise of finality. The engine may report a failure and go
 * on to report itself ready; it may report either of them more than once; and
 * there is deliberately no `cancel`, `dispose` or `release` here, because
 * @vivliostyle/core 2.45.1 offers an attempt no way to be called off and no way to
 * hand its global print instance back early. A port that claimed otherwise would
 * let the lifecycle above rely on something that never happens.
 */
export interface PrintAttemptObserver {
  ready(openDialogue: () => void): void;
  failed(error: Error): void;
}

export interface PrintPort {
  start(html: string, observer: PrintAttemptObserver): void;
}

/**
 * The print engine this application actually prints through (ADR-0001), narrowed
 * to the two answers above. Vivliostyle lays the document out again in a hidden
 * iframe and calls that frame's `print()`, so the printed PDF is paginated by the
 * same engine and the same markup the preview showed.
 *
 * Vivliostyle reports a failure as a bare string, which is turned into an Error
 * here, in the wording the author's status surface already shows, so that
 * everything above this port only ever handles Errors.
 */
export function createVivliostylePrintPort(startPrint: typeof printHTML = printHTML): PrintPort {
  return {
    start(html, observer) {
      startPrint(html, {
        title: 'Grimoire Press',
        printCallback: (iframeWindow) => observer.ready(() => iframeWindow.print()),
        errorCallback: (message) =>
          observer.failed(
            new Error(`Vivliostyle failed to prepare the book for printing: ${message}`),
          ),
        hideIframe: true,
        removeIframe: true,
      });
    },
  };
}

/**
 * Vivliostyle keeps a single global print instance, so a second attempt started
 * while an earlier one is alive repoints it out from under that earlier one: the
 * first frame could print the wrong markup, and its callbacks could fire after the
 * second attempt's cleanup already ran. Both guards against that live in this
 * closure, which is why there is one instance of it in production and a fresh one
 * per test:
 *
 * - `inFlight` is the attempt the author is waiting on. A call made while it is
 *   there joins it instead of starting a second one.
 * - `engineSlotBlocked` outlives that. An attempt given up on -- timed out, or
 *   failed -- has settled its caller but has *not* got the global print instance
 *   back, and only the engine reporting that attempt ready ever does (that is the
 *   point at which Vivliostyle runs its own teardown). Until then a new attempt is
 *   refused rather than started onto an instance someone else still owns.
 *
 * An abandoned attempt's late answers are still real: `printCallback` opens the
 * browser's print dialogue, and a dialogue for a book the author asked to print
 * minutes ago, over whatever they are doing now, is a real thing happening to a
 * real person. Since the engine offers no way to take its callbacks back, each
 * attempt declines to act instead.
 */
export function createPrinting(
  scheduler: Scheduler,
  port: PrintPort = createVivliostylePrintPort(),
): (html: string) => Promise<void> {
  let inFlight: Promise<void> | undefined;
  let engineSlotBlocked = false;

  return function printBook(html: string): Promise<void> {
    if (inFlight !== undefined) return inFlight;
    if (engineSlotBlocked) {
      return Promise.reject(new EngineTimeoutError(PRINT_TIMEOUT_SECONDS));
    }

    let timeout: Schedule | undefined;

    const attempt = new Promise<void>((resolve, reject) => {
      // 'waiting'   -- the caller still has this attempt, and the engine owes it an answer.
      // 'abandoned' -- the caller has been settled, but the engine still holds its print
      //                instance, so only a ready answer is still worth hearing.
      // 'finished'  -- the engine is done with this attempt; nothing it says now means anything.
      let phase: 'waiting' | 'abandoned' | 'finished' = 'waiting';

      const giveUp = (error: Error): void => {
        phase = 'abandoned';
        engineSlotBlocked = true;
        reject(error);
      };

      timeout = scheduler.schedule(() => {
        if (phase !== 'waiting') return;
        giveUp(new EngineTimeoutError(PRINT_TIMEOUT_SECONDS));
      }, PRINT_TIMEOUT_SECONDS * 1000);

      try {
        port.start(html, {
          ready(openDialogue) {
            if (phase === 'finished') return;
            // The engine has finished with this attempt either way, so its print
            // instance is free again -- but a dialogue is opened only for the
            // caller still waiting on one.
            const abandoned = phase === 'abandoned';
            phase = 'finished';
            engineSlotBlocked = false;
            if (abandoned) return;

            try {
              openDialogue();
            } catch (error) {
              // Thrown back at the engine, this would strand its global print
              // instance: Vivliostyle runs its own teardown only once this
              // callback has returned.
              reject(error);
              return;
            }
            resolve();
          },
          failed(error) {
            if (phase !== 'waiting') return;
            // A failed attempt has not handed the print instance back -- the
            // engine may still go on to report this very book ready -- so the
            // caller is told while new attempts stay blocked.
            giveUp(error);
          },
        });
      } catch (error) {
        // Nothing was ever started, so nothing holds the print instance.
        phase = 'finished';
        reject(error);
      }
    }).finally(() => {
      // An attempt that answered in time leaves no deadline behind to fire into an
      // empty session a minute later.
      if (timeout !== undefined) scheduler.cancel(timeout);
      inFlight = undefined;
    });

    inFlight = attempt;
    return attempt;
  };
}
