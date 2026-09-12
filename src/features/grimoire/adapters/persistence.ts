/**
 * The browser slot the editor's draft is kept in. Reading and writing only: when a
 * draft is written, and how long that machinery lives, is `app/persistence`'s policy.
 */

const STORAGE_KEY = "grimoire:draft";

export interface DraftStorage {
  /** The stored draft, or undefined when none is stored or storage cannot be read. */
  read(): string | undefined;
  /** Throws when the browser refuses the write (quota, policy, private browsing). */
  write(source: string): void;
}

export const draftStorage: DraftStorage = {
  read() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (typeof stored === "string") return stored;
    } catch {
      // localStorage is unavailable or inaccessible (private browsing, quota exceeded, etc.)
    }
    return undefined;
  },
  write(source) {
    localStorage.setItem(STORAGE_KEY, source);
  },
};
