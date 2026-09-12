import type { Page as BrowserPage } from '@playwright/test';

import { connectAppHost, type AppScenarioName } from './private/app-session';

type PrintingAppScenarioName = Extract<
  AppScenarioName,
  'print-error' | 'overflow-print-error' | 'preview-controlled-engine'
>;

export interface PrintingSession {
  replaceSource(source: string): Promise<void>;
  print(): Promise<void>;
  statusText(): Promise<string | null>;
  previewText(): Promise<string>;
  advanceEngineClock(ms: number): Promise<void>;
  stallEngine(): Promise<void>;
  unstallEngine(): Promise<void>;
  stalledEngineRuns(): Promise<number>;
  resumeOldestStalledEngineRun(): Promise<boolean>;
  printAttemptsStarted(): Promise<number>;
  printDialoguesOpened(): Promise<number>;
}

export async function openPrintingSession(
  browserPage: BrowserPage,
  scenario: PrintingAppScenarioName,
): Promise<PrintingSession> {
  const transport = await connectAppHost(browserPage, scenario);

  return {
    replaceSource: (source) => transport.call('replaceSource', { source }),

    async print() {
      await browserPage.locator('#print').click();
    },

    statusText: () => browserPage.locator('#status').textContent(),

    async previewText() {
      const frame = browserPage.locator(
        '#preview > iframe[data-grimoire-preview-document]:not([aria-hidden])',
      );
      if ((await frame.count()) > 0) {
        return frame.evaluate(
          (previewFrame: HTMLIFrameElement) => previewFrame.contentDocument?.body.textContent ?? '',
        );
      }
      return browserPage.locator('#preview').textContent().then((text) => text ?? '');
    },

    advanceEngineClock: (ms) => transport.call('advanceEngineClock', { ms }),
    stallEngine: () => transport.call('stallEngine', undefined),
    unstallEngine: () => transport.call('unstallEngine', undefined),
    stalledEngineRuns: () => transport.call('stalledEngineRuns', undefined),
    resumeOldestStalledEngineRun: () =>
      transport.call('resumeOldestStalledEngineRun', undefined),
    printAttemptsStarted: () => transport.call('printAttemptsStarted', undefined),
    printDialoguesOpened: () => transport.call('printDialoguesOpened', undefined),
  };
}
