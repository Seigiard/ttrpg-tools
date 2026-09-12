import type { DraftStorage } from "../adapters/persistence";
import { browserScheduler, type Schedule, type Scheduler } from "../adapters/private/scheduler";

const WRITE_DEBOUNCE_MS = 1000;

export interface DraftPersistence {
  read(): string | undefined;
  write(source: string, onResult?: (error?: unknown) => void): void;
  flush(): void;
  dispose(): void;
}

export interface DraftPersistenceOptions {
  readonly storage: DraftStorage;
  /** Focused tests drive the debounce through a controlled scheduler. */
  readonly scheduler?: Scheduler;
}

interface PendingWrite {
  readonly source: string;
  readonly onResult?: (error?: unknown) => void;
}

/**
 * Owns when the author's draft reaches storage and how long that machinery lives.
 *
 * Writes land a second after the last change rather than once per keystroke. The
 * debounce opens a window in which the newest edits exist only in memory, so a
 * pending write is also flushed on `pagehide`: that event fires when the tab closes,
 * when the author navigates away, and when the page enters the back forward cache,
 * which `unload` does not cover. `pagehide` is a flush signal only -- the session
 * stays usable afterwards, and disposal belongs to whoever mounted the application.
 */
export function createDraftPersistence({
  storage,
  scheduler = browserScheduler,
}: DraftPersistenceOptions): DraftPersistence {
  let schedule: Schedule | undefined;
  /**
   * One slot, holding the latest requested write and the callback that reports it.
   * Superseding a pending write drops its callback with it, so an obsolete request
   * can never report Save health for a source the author has already replaced.
   */
  let pending: PendingWrite | undefined;
  let active = true;

  const persist = ({ source, onResult }: PendingWrite): void => {
    try {
      storage.write(source);
      onResult?.();
    } catch (error) {
      // Storage can be full, disabled by policy, or locked out in private browsing.
      // The author keeps working in this session; only persistence is lost, so the
      // failure is reported rather than raised.
      console.error("Grimoire Press could not save the draft:", error);
      onResult?.(error);
    }
  };

  const flush = (): void => {
    if (schedule !== undefined) {
      scheduler.cancel(schedule);
      schedule = undefined;
    }

    const write = pending;
    pending = undefined;
    if (write !== undefined) persist(write);
  };

  window.addEventListener("pagehide", flush);

  return {
    read: () => storage.read(),
    write(source, onResult) {
      if (!active) return;

      pending = { source, onResult };
      if (schedule !== undefined) scheduler.cancel(schedule);
      schedule = scheduler.schedule(flush, WRITE_DEBOUNCE_MS);
    },
    flush,
    dispose() {
      if (!active) return;

      flush();
      active = false;
      window.removeEventListener("pagehide", flush);
    },
  };
}
