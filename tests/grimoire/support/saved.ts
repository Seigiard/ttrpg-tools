import type { Download, Page as BrowserPage } from '@playwright/test';

import { connectAppHost, type AppScenarioName } from './private/app-session';

const COMMITTED_PREVIEW_FRAME = 'iframe[data-grimoire-preview-document]:not([aria-hidden])';
const ISOLATED_PREVIEW_FRAME = 'iframe[data-grimoire-preview-document]';

export type SavedFileScenario = Extract<AppScenarioName, 'saved-file' | 'saved-file-load-race'>;

export interface DialogObservation {
  readonly message: string;
}

export interface OpenFileOptions {
  readonly confirm?: 'accept' | 'dismiss';
}

export interface RepaintCounter {
  count(): Promise<number>;
}

export interface SavedFileSession {
  source(): Promise<string>;
  previewText(): Promise<string | null>;
  statusText(): Promise<string | null>;
  replaceSource(source: string): Promise<void>;
  download(): Promise<Download>;
  openFile(path: string, options?: OpenFileOptions): Promise<DialogObservation | undefined>;
  countPreviewRepaints(): Promise<RepaintCounter>;
}

export async function openSavedFileSession(
  browserPage: BrowserPage,
  scenario: SavedFileScenario = 'saved-file',
): Promise<SavedFileSession> {
  const transport = await connectAppHost(browserPage, scenario);
  const editor = browserPage.locator('.cm-editor');

  return {
    source: () => transport.call('source', undefined),

    previewText: () =>
      browserPage.evaluate((committedPreviewFrame) => {
        const preview = document.getElementById('preview');
        const frame = preview?.querySelector<HTMLIFrameElement>(
          committedPreviewFrame,
        );
        return frame?.contentDocument?.body.textContent ?? preview?.textContent ?? null;
      }, COMMITTED_PREVIEW_FRAME),

    statusText: () => browserPage.locator('#status').textContent(),

    async replaceSource(source) {
      await editor.click();
      await browserPage.keyboard.press('ControlOrMeta+A');
      await browserPage.keyboard.type(source);
    },

    async download() {
      const [download] = await Promise.all([
        browserPage.waitForEvent('download'),
        browserPage.locator('#download').click(),
      ]);
      return download;
    },

    async openFile(path, options) {
      let dialog: Promise<DialogObservation | undefined> = Promise.resolve(undefined);
      if (options?.confirm !== undefined) {
        dialog = browserPage.waitForEvent('dialog').then(async (nativeDialog) => {
          const observation = { message: nativeDialog.message() };
          if (options.confirm === 'accept') await nativeDialog.accept();
          else await nativeDialog.dismiss();
          return observation;
        });
      }

      const [, dialogObservation] = await Promise.all([
        browserPage.locator('#load').setInputFiles(path),
        dialog,
      ]);
      return dialogObservation;
    },

    async countPreviewRepaints() {
      const counter = await browserPage.evaluateHandle(
        ({ committedPreviewFrame, isolatedPreviewFrame }) => {
          const counted = { total: 0 };
          const preview = document.getElementById('preview');
          if (
            preview !== null &&
            preview.querySelector(isolatedPreviewFrame) !== null &&
            preview.querySelector(committedPreviewFrame) === null
          ) {
            throw new Error('Cannot count preview repaints before the isolated preview has committed');
          }
          new MutationObserver((mutations) => {
            if (mutations.some((mutation) => mutation.removedNodes.length > 0)) {
              counted.total += 1;
            }
          }).observe(preview ?? document.body, { childList: true });
          return counted;
        },
        { committedPreviewFrame: COMMITTED_PREVIEW_FRAME, isolatedPreviewFrame: ISOLATED_PREVIEW_FRAME },
      );

      return { count: () => counter.evaluate((counted) => counted.total) };
    },
  };
}
