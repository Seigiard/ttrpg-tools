import { renderBook } from "../core/render-book";
import type { createEditor, EditorHandle } from "../adapters/editor";
import type { downloadBook, loadBookFile } from "../adapters/file";
import type { paginate } from "../adapters/pagination";
import type { printBook } from "../adapters/printing";
import {
  toBookMarkupError,
  toBookPrintError,
  toPreviewRefreshError,
  toSavedFileLoadError,
} from "./operation-error";
import { createStatus } from "./status";

const INITIAL_SOURCE = [
  '<Book theme="default-ru">',
  "# Untitled book",
  "",
  "Start writing your book here.",
  "</Book>",
  "",
].join("\n");

// How long the Preview waits after the last keystroke before it refreshes. Long
// enough that a normal typing cadence never triggers a refresh mid-word, short
// enough that a pause reads as "done for now" rather than a stall.
const REFRESH_DEBOUNCE_MS = 400;

/**
 * The DOM elements the app is wired to. Bundled as one named record rather than
 * positional parameters: most of them share the same `HTMLElement` type, so
 * transposing two at a call site would compile cleanly and only fail at runtime.
 * This is a plain record of references, not a dependency container that resolves
 * anything -- ADR-0004 forbids the latter, not the former; the adapter functions
 * below stay separate arguments.
 */
export interface AppElements {
  readonly editorContainer: HTMLElement;
  readonly previewContainer: HTMLElement;
  readonly printControl: HTMLElement;
  readonly refreshControl: HTMLElement;
  readonly autoRefreshControl: HTMLInputElement;
  readonly statusContainer: HTMLElement;
  readonly downloadControl: HTMLElement;
  readonly loadControl: HTMLInputElement;
}

/**
 * The draft store, bundled the same way `AppElements` bundles DOM references and
 * for the same reason: `read` and `write` are two functions that would otherwise
 * sit as adjacent, identically-shaped parameters next to `downloadBookAdapter`
 * below (both `(source: string) => void` -- or, for `read`, close enough that a
 * transposition still compiles). Naming the two fields is what makes the
 * compiler catch a swap instead of running it: an object isn't assignable where
 * a bare function is expected, so mixing this up with `downloadBookAdapter` or
 * `loadBookFileAdapter` fails to typecheck rather than silently downloading the
 * draft or saving the book into local storage.
 */
export interface PersistenceAdapter {
  readonly read: () => string | undefined;
  readonly write: (source: string, onResult?: (error?: unknown) => void) => void;
}

/**
 * Wires the editor, pagination, and printing adapters to core's pure rendering. Each
 * adapter arrives as its own parameter, not a bundled options object or a container:
 * three seams, three arguments (ADR-0004).
 *
 * Persistence is delegated to a `read`/`write` adapter pair that reads and writes
 * the draft to browser storage. `write` is responsible for debouncing.
 *
 * The Preview markup is derived whenever it is needed, to refresh and to print
 * alike, rather than stored -- ADR-0004's derived-state model, amended to record
 * the scheduling state this ticket adds (see the ADR itself for why the
 * conclusion still holds).
 *
 * The Preview's own refresh is a second, independent debounce (issue #6): typing
 * always updates the persisted draft on its own schedule, but only schedules a
 * refresh when automatic refreshing is on. A refresh request while one is already
 * running never starts a second one -- it replaces whatever request was already
 * waiting and is picked up the moment the running one settles, so two refreshes are
 * never in flight together and the last request made is always the last one that
 * reaches the container (issue #6's first handed-over defect: overlapping refreshes
 * had no cancellation, so a slow one could finish after, and clobber, a faster
 * newer one).
 *
 * Downloading and loading a book (issue #8) are wired the same way: two more
 * adapter functions, each its own parameter. Loading replaces the editor's whole
 * buffer -- through `EditorHandle.setSource`, so it flows through the same
 * `onChange` a keystroke would and is persisted as the new draft the same way --
 * after the author confirms, since there is no way back from replacing a book
 * other than CodeMirror's own undo history. The confirmation is asked only once
 * the file has already been read and validated, so declining it is the only way a
 * load has any visible effect on a book that turns out fine; a file this editor
 * cannot read as a book never reaches the question at all.
 */
export function startApp(
  elements: AppElements,
  createEditorAdapter: typeof createEditor,
  paginateAdapter: typeof paginate,
  printBookAdapter: typeof printBook,
  persistenceAdapter: PersistenceAdapter,
  downloadBookAdapter: typeof downloadBook,
  loadBookFileAdapter: typeof loadBookFile,
): EditorHandle {
  const {
    editorContainer,
    previewContainer,
    printControl,
    refreshControl,
    autoRefreshControl,
    statusContainer,
    downloadControl,
    loadControl,
  } = elements;

  const status = createStatus(statusContainer);

  let running = false;
  let pendingSource: string | undefined;
  let pendingAutomatic = false;
  let resizePending = false;
  // Unlike the current editor draft, this is publication state: the source of the
  // frame that actually committed. Resize may reproduce it even when auto-refresh
  // is off, without exposing edits the author has not published.
  let displayedSource: string | undefined;

  function afterRun(): void {
    running = false;
    if (pendingSource !== undefined) {
      const next = pendingSource;
      const automatic = pendingAutomatic;
      pendingSource = undefined;
      pendingAutomatic = false;
      if (!automatic || autoRefreshControl.checked) {
        // This run starts after the resize and therefore measures the current
        // container. It supersedes a separate repaint of the visible source.
        resizePending = false;
        run(next);
        return;
      }
    }
    if (resizePending && displayedSource !== undefined) {
      resizePending = false;
      run(displayedSource);
    }
  }

  function run(source: string): void {
    running = true;
    let html: string;
    try {
      html = renderBook({ source });
    } catch (error) {
      // Thrown before the pagination adapter is ever called, so the container --
      // and whatever it last showed -- is never touched.
      try {
        status.previewFailed(toBookMarkupError(error));
      } finally {
        // An unexpected core exception is rethrown, but must not leave the
        // refresh scheduler permanently claiming that a run is still active.
        afterRun();
      }
      return;
    }
    void paginateAdapter(previewContainer, html)
      .then((result) => {
        displayedSource = source;
        status.previewSucceeded(result.overflowingPages);
      })
      // A refresh that failed leaves the production Preview showing the last
      // book that paginated (ADR-0008); direct adapter fixtures provide the same
      // visible guarantee by restoration (ADR-0005). Any overflow standing
      // against that book is still true of what the author is looking at and is
      // left alone. Only a refresh that produced a book has anything to say
      // about which of its pages fit.
      .catch((error: unknown) => status.previewFailed(toPreviewRefreshError(error)))
      .finally(afterRun);
  }

  const requestRefresh = (source: string, automatic = false): void => {
    if (running) {
      pendingSource = source;
      pendingAutomatic = automatic;
      return;
    }
    run(source);
  };

  let debounceId: ReturnType<typeof setTimeout> | undefined;
  const clearScheduledRefresh = (): void => {
    if (debounceId !== undefined) {
      clearTimeout(debounceId);
      debounceId = undefined;
    }
  };
  const scheduleRefresh = (source: string): void => {
    clearScheduledRefresh();
    debounceId = setTimeout(() => {
      debounceId = undefined;
      requestRefresh(source, true);
    }, REFRESH_DEBOUNCE_MS);
  };

  const initialSource = persistenceAdapter.read() ?? INITIAL_SOURCE;

  // CodeMirror's buffer remains the only copy of the current draft, read back
  // through `editor.getSource()` wherever the latest text is needed. The committed
  // source above is intentionally different state: it can lag behind this draft
  // while auto-refresh is off (ADR-0004, ADR-0008).
  const onChange = (source: string): void => {
    persistenceAdapter.write(source, (error) => {
      if (error === undefined) status.saveSucceeded();
      else status.saveFailed();
    });
    if (autoRefreshControl.checked) {
      scheduleRefresh(source);
    }
  };

  const editor = createEditorAdapter(editorContainer, initialSource, onChange);

  if (previewContainer.hasAttribute("data-isolated")) {
    let width = previewContainer.clientWidth;
    let height = previewContainer.clientHeight;
    new ResizeObserver(() => {
      const nextWidth = previewContainer.clientWidth;
      const nextHeight = previewContainer.clientHeight;
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;

      if (running) {
        resizePending = true;
      } else if (displayedSource !== undefined) {
        requestRefresh(displayedSource);
      }
    }).observe(previewContainer);
  }

  refreshControl.addEventListener("click", () => {
    // A manual refresh acts on the latest source immediately -- a pending
    // automatic one would otherwise still fire moments later on the same source.
    clearScheduledRefresh();
    requestRefresh(editor.getSource());
  });

  autoRefreshControl.addEventListener("change", () => {
    if (autoRefreshControl.checked) {
      requestRefresh(editor.getSource());
    } else {
      // Otherwise a debounce armed the moment before the author switched
      // automatic refreshing off would still fire afterwards, refreshing once
      // more despite being told not to.
      clearScheduledRefresh();
      if (pendingAutomatic) {
        pendingSource = undefined;
        pendingAutomatic = false;
      }
    }
  });

  let printToken = 0;

  printControl.addEventListener("click", () => {
    const token = ++printToken;
    let html: string;
    try {
      html = renderBook({ source: editor.getSource() });
    } catch (error) {
      if (token === printToken) status.printFailed(toBookMarkupError(error));
      return;
    }
    printBookAdapter(html)
      .then(() => {
        if (token === printToken) status.clearPrint();
      })
      .catch((error: unknown) => {
        if (token === printToken) status.printFailed(toBookPrintError(error));
      });
  });

  downloadControl.addEventListener("click", () => {
    downloadBookAdapter(editor.getSource());
  });

  // Picking a second file before the first has finished reading must never let
  // the first's result land after the second's and overwrite it -- the same
  // overlapping-async hazard issue #6 solved for refreshes, reapplied here: each
  // selection gets its own token, and a result is only ever applied if its token
  // is still the most recent one requested. Unlike the refresh queue, a stale
  // result needs no replay -- there is nothing to coalesce into, since the
  // newer selection is already what the author meant to load -- so it is simply
  // discarded.
  let loadToken = 0;

  loadControl.addEventListener("change", () => {
    const file = loadControl.files?.[0];
    // Cleared unconditionally so choosing the very same file again still fires a
    // 'change' event -- the browser does not consider re-picking an unchanged
    // value a change otherwise.
    loadControl.value = "";
    if (!file) return;

    const token = ++loadToken;

    loadBookFileAdapter(file).then(
      (source) => {
        if (token !== loadToken) return; // superseded by a later selection

        status.savedFileValidated();

        // Asked only now that the file is known to be a genuine book: an author
        // who picks the wrong file entirely is told so without first being asked
        // whether to discard their current work over it.
        const proceed = window.confirm("Loading this file replaces the book you are currently editing. Continue?");
        if (!proceed) return;

        // `setSource` fires the same update listener a keystroke would, which
        // arms a debounced refresh of its own when auto-refresh is on -- cleared
        // here, after the fact, so the immediate refresh below is the only one
        // that runs. Clearing before `setSource` would not help: the debounce it
        // is meant to cancel is armed by `setSource` itself, one line later.
        editor.setSource(source);
        clearScheduledRefresh();
        requestRefresh(source);
        // Both belonged to the book this load just replaced.
        printToken += 1;
        status.clearPrint();
      },
      (error: unknown) => {
        if (token !== loadToken) return; // superseded by a later selection
        status.loadFailed(toSavedFileLoadError(error));
      },
    );
  });

  requestRefresh(initialSource);

  return editor;
}
