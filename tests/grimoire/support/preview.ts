import type { Locator, Page as BrowserPage } from '@playwright/test';

import { connectAppHost } from './private/app-session';
import type { AppScenarioName } from './private/app-session';

type PreviewScenarioName = Extract<
  AppScenarioName,
  'preview' | 'preview-coalescing' | 'preview-engine-failure' | 'preview-first-engine-failure'
  | 'preview-controlled-engine'
  | 'preview-controlled-engine-isolated'
>;

export interface RepaintCounter {
  count(): Promise<number>;
}

export interface PreviewSession {
  source(): Promise<string>;
  replaceSource(source: string): Promise<void>;
  typeBeforeBookClose(text: string, options?: { readonly delay?: number }): Promise<void>;
  refresh(): Promise<void>;
  setAutomaticRefresh(enabled: boolean): Promise<void>;
  previewText(): Promise<string>;
  previewMarkup(): Promise<string>;
  previewAttributes(): Promise<string>;
  status(): Locator;
  statusText(): Promise<string | null>;
  countRepaints(): Promise<RepaintCounter>;
  finishSlowPagination(): Promise<void>;
  makeEngineFail(): Promise<void>;
  advanceEngineClock(ms: number): Promise<void>;
  pendingEngineDeadlines(): Promise<number>;
  stallEngine(): Promise<void>;
  unstallEngine(): Promise<void>;
  stalledEngineRuns(): Promise<number>;
  oldestStalledEngineDocument(): Promise<string | undefined>;
  resumeOldestStalledEngineRun(): Promise<boolean>;
  resumeOldestStalledEngineRunUntilLoaded(): Promise<boolean>;
  failOldestStalledEngineRun(): Promise<boolean>;
}

export async function openPreviewSession(
  browserPage: BrowserPage,
  scenario: PreviewScenarioName = 'preview',
): Promise<PreviewSession> {
  const transport = await connectAppHost(browserPage, scenario);
  const editor = browserPage.locator('.cm-editor');

  const activePreviewFrame = browserPage.locator(
    '#preview > iframe[data-grimoire-preview-document]:not([aria-hidden])',
  );

  const activePreviewBodyText = () =>
    activePreviewFrame.evaluate(
      (frame: HTMLIFrameElement) => frame.contentDocument?.body.textContent ?? '',
    );

  const activePreviewBodyMarkup = () =>
    activePreviewFrame.evaluate(
      (frame: HTMLIFrameElement) => frame.contentDocument?.body.innerHTML ?? '',
    );

  return {
    source: () => transport.call('source', undefined),

    replaceSource: (source) => transport.call('replaceSource', { source }),

    async typeBeforeBookClose(text, options) {
      await editor.click();
      await browserPage.keyboard.press('ControlOrMeta+End');
      await browserPage.keyboard.press('ArrowUp');
      await browserPage.keyboard.press('Home');
      await browserPage.keyboard.type(text, options);
    },

    async refresh() {
      await browserPage.locator('#refresh').click();
    },

    async setAutomaticRefresh(enabled) {
      const control = browserPage.locator('#auto-refresh');
      if (enabled) await control.check();
      else await control.uncheck();
    },

    async previewText() {
      if ((await activePreviewFrame.count()) > 0) return activePreviewBodyText();
      return browserPage.locator('#preview').textContent().then((text) => text ?? '');
    },

    async previewMarkup() {
      if ((await activePreviewFrame.count()) > 0) return activePreviewBodyMarkup();
      return browserPage.locator('#preview').innerHTML();
    },

    previewAttributes: () =>
      browserPage.evaluate(() =>
        [...document.getElementById('preview')!.attributes]
          .map((attribute) => `${attribute.name}=${attribute.value}`)
          .sort()
          .join('\n'),
      ),

    status: () => browserPage.locator('#status'),

    statusText: () => browserPage.locator('#status').textContent(),

    async countRepaints() {
      const counter = await browserPage.evaluateHandle(() => {
        const counted = { total: 0 };
        const native = Element.prototype.replaceChildren;
        const preview = document.getElementById('preview')!;
        Element.prototype.replaceChildren = function (...args: (string | Node)[]) {
          if (this === preview) counted.total += 1;
          return native.apply(this, args);
        };
        return counted;
      });

      return { count: () => counter.evaluate((counted) => counted.total) };
    },

    finishSlowPagination: () => transport.call('finishSlowPagination', undefined),

    makeEngineFail: () => transport.call('makePreviewEngineFail', undefined),

    advanceEngineClock: (ms) => transport.call('advanceEngineClock', { ms }),

    pendingEngineDeadlines: () => transport.call('pendingEngineDeadlines', undefined),

    stallEngine: () => transport.call('stallEngine', undefined),

    unstallEngine: () => transport.call('unstallEngine', undefined),

    stalledEngineRuns: () => transport.call('stalledEngineRuns', undefined),

    oldestStalledEngineDocument: () => transport.call('oldestStalledEngineDocument', undefined),

    resumeOldestStalledEngineRun: () => transport.call('resumeOldestStalledEngineRun', undefined),

    resumeOldestStalledEngineRunUntilLoaded: () =>
      transport.call('resumeOldestStalledEngineRunUntilLoaded', undefined),

    failOldestStalledEngineRun: () => transport.call('failOldestStalledEngineRun', undefined),
  };
}
