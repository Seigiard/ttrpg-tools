import { printHTML } from '@vivliostyle/core';

import { EngineTimeoutError } from '../engine-timeout';
import type { Schedule, Scheduler } from './scheduler';

const PRINT_TIMEOUT_SECONDS = 60;

export function createPrinting(scheduler: Scheduler): (html: string) => Promise<void> {
  let inFlight: Promise<void> | undefined;
  let abandonedAttemptPending = false;

  return function printBook(html: string): Promise<void> {
    if (inFlight !== undefined) return inFlight;
    if (abandonedAttemptPending) {
      return Promise.reject(new EngineTimeoutError(PRINT_TIMEOUT_SECONDS));
    }

    let timeout: Schedule | undefined;

    const attempt = new Promise<void>((resolve, reject) => {
      // The hidden iframe keeps working after this attempt has been given up on,
      // and neither of its answers may act on an abandoned print.
      let abandoned = false;

      timeout = scheduler.schedule(() => {
        abandoned = true;
        abandonedAttemptPending = true;
        reject(new EngineTimeoutError(PRINT_TIMEOUT_SECONDS));
      }, PRINT_TIMEOUT_SECONDS * 1000);

      printHTML(html, {
        title: 'Grimoire Press',
        printCallback: (iframeWindow) => {
          if (abandoned) {
            abandonedAttemptPending = false;
            return;
          }
          iframeWindow.print();
          resolve();
        },
        errorCallback: (message) => {
          if (abandoned) {
            abandonedAttemptPending = false;
            return;
          }
          reject(new Error(`Vivliostyle failed to prepare the book for printing: ${message}`));
        },
        hideIframe: true,
        removeIframe: true,
      });
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
