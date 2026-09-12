import type { Page as BrowserPage } from '@playwright/test';

import { connectAppHost } from './private/app-session';

/**
 * The key the production Draft adapter writes under, spelled out here rather than
 * imported from that adapter on purpose: the Draft observations below read the
 * browser's own storage, so the oracle stays independent of the code under test.
 */
const DRAFT_STORAGE_KEY = 'grimoire:draft';

export interface TypingOptions {
  /** Milliseconds between keystrokes. `0` is a burst with no pause in it. */
  readonly delay?: number;
}

/** Writes the browser's storage has taken since the counter was installed. */
export interface StorageWriteCounter {
  count(): Promise<number>;
}

/**
 * One editing session of the full application, observed through what the Draft is
 * about: the working copy the author sees, the copy the browser is keeping for them,
 * and what they are told when keeping it fails.
 *
 * A session is valid until the browser page navigates again; `reopen` hands back the
 * session that replaces it.
 */
export interface DraftSession {
  /** What the editor holds now. */
  source(): Promise<string>;
  /** The Draft the browser has stored, or null when it is holding none. */
  storedDraft(): Promise<string | null>;
  /** What the application is currently telling the author, if anything. */
  statusText(): Promise<string | null>;
  /** Types into the real editor at the cursor. */
  type(text: string, options?: TypingOptions): Promise<void>;
  /** Types into the real editor on the last line of the book's body. */
  typeBeforeBookClose(text: string, options?: TypingOptions): Promise<void>;
  /**
   * Counts writes at the browser's own storage API, above the adapter that calls it,
   * so a writer that ignored its debounce would still be counted.
   */
  countStorageWrites(): Promise<StorageWriteCounter>;
  /** Makes every further storage write fail the way a full quota does. */
  failStorageWrites(): Promise<void>;
  /** Closes the tab and opens it again on the same host, as an author would. */
  reopen(): Promise<DraftSession>;
}

export async function openDraftSession(browserPage: BrowserPage): Promise<DraftSession> {
  const transport = await connectAppHost(browserPage, 'production');
  const editor = browserPage.locator('.cm-editor');

  return {
    source: () => transport.call('source', undefined),

    storedDraft: () => browserPage.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY),

    statusText: () => browserPage.locator('#status').textContent(),

    async type(text, options) {
      await editor.click();
      await browserPage.keyboard.type(text, options);
    },

    async typeBeforeBookClose(text, options) {
      await editor.click();
      await browserPage.keyboard.press('ControlOrMeta+End');
      await browserPage.keyboard.press('ArrowUp');
      await browserPage.keyboard.press('Home');
      await browserPage.keyboard.type(text, options);
    },

    async countStorageWrites() {
      const writes = await browserPage.evaluateHandle(() => {
        const counted = { total: 0 };
        const nativeSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string): void {
          counted.total += 1;
          nativeSetItem.call(this, key, value);
        };
        return counted;
      });

      return { count: () => writes.evaluate((counted) => counted.total) };
    },

    async failStorageWrites() {
      await browserPage.evaluate(() => {
        Storage.prototype.setItem = () => {
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        };
      });
    },

    reopen: () => openDraftSession(browserPage),
  };
}
