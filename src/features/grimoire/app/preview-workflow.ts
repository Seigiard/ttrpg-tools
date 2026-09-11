import type { OverflowingPage, paginate } from "../adapters/pagination";
import { renderBook } from "../core/render-book";
import { toPreviewError, type PreviewError } from "./preview-error";

const REFRESH_DEBOUNCE_MS = 400;

export interface PreviewStatus {
  previewFailed(error: PreviewError): void;
  previewSucceeded(pages: readonly OverflowingPage[]): void;
}

export interface PreviewWorkflow {
  sourceChanged(source: string): void;
  refreshRequested(source: string): void;
  automaticRefreshChanged(enabled: boolean, source: string): void;
  destroy(): void;
}

interface PreviewWorkflowOptions {
  readonly container: HTMLElement;
  readonly paginate: typeof paginate;
  readonly status: PreviewStatus;
  readonly automaticRefresh?: boolean;
}

export function createPreviewWorkflow({
  container,
  paginate,
  status,
  automaticRefresh = true,
}: PreviewWorkflowOptions): PreviewWorkflow {
  let active = true;
  let automaticRefreshEnabled = automaticRefresh;
  let running = false;
  let pendingSource: string | undefined;
  let pendingAutomatic = false;
  let debounceId: ReturnType<typeof setTimeout> | undefined;

  const clearScheduledRepaint = (): void => {
    if (debounceId === undefined) return;
    clearTimeout(debounceId);
    debounceId = undefined;
  };

  const afterRun = (): void => {
    running = false;
    if (!active || pendingSource === undefined) return;

    const next = pendingSource;
    const automatic = pendingAutomatic;
    pendingSource = undefined;
    pendingAutomatic = false;
    if (!automatic || automaticRefreshEnabled) run(next);
  };

  const run = (source: string): void => {
    if (!active) return;
    running = true;

    let html: string;
    try {
      html = renderBook({ source });
    } catch (error) {
      status.previewFailed(toPreviewError(error));
      afterRun();
      return;
    }

    void paginate(container, html)
      .then((result) => {
        if (!active) return;
        status.previewSucceeded(result.overflowingPages);
      })
      .catch((error: unknown) => {
        if (active) status.previewFailed(toPreviewError(error));
      })
      .finally(afterRun);
  };

  const requestRepaint = (source: string, automatic = false): void => {
    if (!active) return;
    if (running) {
      pendingSource = source;
      pendingAutomatic = automatic;
      return;
    }
    run(source);
  };

  const scheduleRepaint = (source: string): void => {
    clearScheduledRepaint();
    debounceId = setTimeout(() => {
      debounceId = undefined;
      requestRepaint(source, true);
    }, REFRESH_DEBOUNCE_MS);
  };

  return {
    sourceChanged(source) {
      if (active && automaticRefreshEnabled) scheduleRepaint(source);
    },
    refreshRequested(source) {
      clearScheduledRepaint();
      requestRepaint(source);
    },
    automaticRefreshChanged(enabled, source) {
      if (!active) return;
      automaticRefreshEnabled = enabled;
      if (enabled) {
        requestRepaint(source);
        return;
      }

      clearScheduledRepaint();
      if (pendingAutomatic) {
        pendingSource = undefined;
        pendingAutomatic = false;
      }
    },
    destroy() {
      if (!active) return;
      active = false;
      clearScheduledRepaint();
      pendingSource = undefined;
      pendingAutomatic = false;
    },
  };
}
