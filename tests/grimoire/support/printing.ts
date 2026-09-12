import type { Page as BrowserPage } from '@playwright/test';

import { connectBrowserTransport } from './browser-transport';
import { connectAppHost, type AppScenarioName } from './private/app-session';
import { activePreviewBody } from './private/preview-body';

const REAL_ENGINE_HOST = '/tests/grimoire/fixtures/real-engine-host.html';

type PrintingAppScenarioName = Extract<
  AppScenarioName,
  'print-error' | 'overflow-print-error' | 'preview-controlled-engine'
>;

export interface PrintAttemptObservation {
  readonly firstJoinedSecond: boolean;
}

export interface SequentialPrintObservation {
  readonly firstJoinedSecond: boolean;
}

export interface PrintingTestSurface {
  sharedAttempt(input: { readonly source: string }): PrintAttemptObservation;
  sequentialAttempts(input: { readonly source: string }): Promise<SequentialPrintObservation>;
}

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

export interface PrintingAdapterDriver {
  sharedAttempt(source: string): Promise<PrintAttemptObservation>;
  sequentialAttempts(source: string): Promise<SequentialPrintObservation>;
}

export async function openPrintingAdapterDriver(
  browserPage: BrowserPage,
): Promise<PrintingAdapterDriver> {
  const transport = await connectBrowserTransport<PrintingTestSurface>(
    browserPage,
    REAL_ENGINE_HOST,
  );

  return {
    sharedAttempt: (source) => transport.call('sharedAttempt', { source }),
    sequentialAttempts: (source) => transport.call('sequentialAttempts', { source }),
  };
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
      return (await activePreviewBody(browserPage)).textContent().then((text) => text ?? '');
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
